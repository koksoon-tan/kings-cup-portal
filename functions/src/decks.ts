import { onObjectFinalized } from "firebase-functions/v2/storage";
import { logger } from "firebase-functions";
import JSZip from "jszip";
import sharp from "sharp";
import { db, storage, FieldValue, REGION, audit } from "./common";

/**
 * Deck art upload.
 * The admin uploads a zip to  decks/{deckId}/uploads/{anything}.zip
 * Required file names (case-insensitive, png/jpg/jpeg/webp, any folder inside the zip):
 *   AS 2S … 10S JS QS KS   (spades)   – same for H (hearts), D (diamonds), C (clubs)
 *   JK1  JK2               (jokers)
 *   BACK                   (card back)
 * = 55 files. Separators are ignored, so "A_S.png", "a-s.PNG" and "AS.png" are all fine.
 */
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const SUITS = ["S", "H", "D", "C"];
export const CARD_KEYS = [...SUITS.flatMap((s) => RANKS.map((r) => `${r}${s}`)), "JK1", "JK2", "BACK"];

const MIN_DPI = 300;
const PREVIEW_WIDTH = 600;

export const processDeckZip = onObjectFinalized(
  { region: REGION, memory: "2GiB", timeoutSeconds: 540, cpu: 2 },
  async (event) => {
    const path = event.data.name ?? "";
    const m = path.match(/^decks\/([^/]+)\/uploads\/[^/]+\.zip$/i);
    if (!m) return;
    const deckId = m[1];
    const deckRef = db.collection("decks").doc(deckId);
    const deck = await deckRef.get();
    if (!deck.exists) { logger.warn(`Zip for unknown deck ${deckId}`); return; }

    await deckRef.update({ "upload.status": "processing", "upload.zipPath": path, "upload.errors": [], "upload.warnings": [] });
    const bucket = storage.bucket(event.data.bucket);
    const errors: string[] = [];
    const warnings: string[] = [];
    try {
      const [buf] = await bucket.file(path).download();
      const zip = await JSZip.loadAsync(buf);
      const found = new Map<string, { entry: JSZip.JSZipObject; ext: string; original: string }>();

      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        const base = entry.name.split("/").pop() ?? "";
        if (!base || base.startsWith(".") || entry.name.includes("__MACOSX")) continue;
        const dot = base.lastIndexOf(".");
        const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
        if (!["png", "jpg", "jpeg", "webp"].includes(ext)) { warnings.push(`Ignored ${entry.name} (not an image)`); continue; }
        const key = base.slice(0, dot).toUpperCase().replace(/[\s_\-]/g, "").replace(/^T([SHDC])$/, "10$1");
        if (!CARD_KEYS.includes(key)) { warnings.push(`Ignored ${base}: name doesn't match any card`); continue; }
        if (found.has(key)) { errors.push(`Duplicate card ${key}: ${found.get(key)!.original} and ${base}`); continue; }
        found.set(key, { entry, ext, original: base });
      }
      const missing = CARD_KEYS.filter((k) => !found.has(k));
      if (missing.length) errors.push(`Missing ${missing.length} card(s): ${missing.join(", ")}`);

      // Inspect every image before writing anything.
      const images = new Map<string, { data: Buffer; width: number; height: number; density: number; ext: string }>();
      for (const [key, f] of found) {
        const data = await f.entry.async("nodebuffer");
        try {
          const meta = await sharp(data).metadata();
          images.set(key, { data, width: meta.width ?? 0, height: meta.height ?? 0, density: meta.density ?? 0, ext: f.ext });
        } catch {
          errors.push(`${f.original} is not a readable image`);
        }
      }
      // Dimension consistency (against the most common size).
      const sizes = new Map<string, number>();
      images.forEach((i) => sizes.set(`${i.width}x${i.height}`, (sizes.get(`${i.width}x${i.height}`) ?? 0) + 1));
      const common = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      images.forEach((i, k) => {
        if (`${i.width}x${i.height}` !== common) errors.push(`${k} is ${i.width}x${i.height}px, other cards are ${common}px`);
      });
      const lowDpi = [...images.entries()].filter(([, i]) => i.density && i.density < MIN_DPI).map(([k]) => k);
      if (lowDpi.length) warnings.push(`Below ${MIN_DPI} DPI (check print quality): ${lowDpi.join(", ")}`);

      if (errors.length) {
        await deckRef.update({ "upload.status": "error", "upload.errors": errors, "upload.warnings": warnings, "upload.processedAt": FieldValue.serverTimestamp() });
        return;
      }

      const cards: Record<string, unknown> = {};
      const version = (deck.data()!.artVersion ?? 0) + 1;
      await Promise.all([...images.entries()].map(async ([key, img]) => {
        const artPath = `decks/${deckId}/art/v${version}/${key}.${img.ext}`;
        const previewPath = `decks/${deckId}/art/v${version}/preview/${key}.webp`;
        const preview = await sharp(img.data).resize({ width: PREVIEW_WIDTH }).webp({ quality: 85 }).toBuffer();
        await Promise.all([
          bucket.file(artPath).save(img.data, { contentType: img.ext === "jpg" ? "image/jpeg" : `image/${img.ext}` }),
          bucket.file(previewPath).save(preview, { contentType: "image/webp", metadata: { cacheControl: "public, max-age=31536000" } }),
        ]);
        cards[key] = { path: artPath, previewPath, width: img.width, height: img.height, density: img.density || null };
      }));

      await deckRef.update({
        cards,
        artVersion: version,
        cardSize: common,
        "upload.status": "ready",
        "upload.errors": [],
        "upload.warnings": warnings,
        "upload.processedAt": FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await audit(null, "deck.artProcessed", "decks", deckId, { version, warnings: warnings.length });
    } catch (e: any) {
      logger.error("Deck zip processing failed", e);
      await deckRef.update({ "upload.status": "error", "upload.errors": [`Processing failed: ${e?.message ?? e}`], "upload.warnings": warnings });
    }
  },
);
