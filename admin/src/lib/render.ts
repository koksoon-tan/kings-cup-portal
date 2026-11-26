import { fontKey } from "../../../shared/render";
import { storageUrl } from "./hooks";

/**
 * One renderer for both the on-screen preview and the print export, so what you
 * see is exactly what gets printed (and what the mobile app should replicate).
 */

export { SYSTEM_FONTS, BUILTIN_FONTS } from "../../../shared/cards";
export { drawCard, contentFor, familyFor, fontKey } from "../../../shared/render";
export type { CardText } from "../../../shared/render";

export interface FontDoc { id: string; name: string; path: string }

const loadedFonts = new Map<string, Promise<void>>();

/** Loads an uploaded font into the document so canvas can draw with it. */
export function ensureFont(font: FontDoc | undefined): Promise<void> {
  if (!font) return Promise.resolve();
  const key = fontKey(font.id);
  if (!loadedFonts.has(key)) {
    loadedFonts.set(key, (async () => {
      const url = await storageUrl(font.path);
      const face = new FontFace(key, `url(${url})`);
      await face.load();
      document.fonts.add(face);
      // load bold synthetic variant hint
      await document.fonts.load(`bold 16px "${key}"`).catch(() => undefined);
    })().catch((e) => { loadedFonts.delete(key); throw e; }));
  }
  return loadedFonts.get(key)!;
}

const imgCache = new Map<string, Promise<HTMLImageElement>>();

/** Loads an image with CORS (needed for export). Falls back to non-CORS for display only. */
export function loadImage(url: string, requireCors = false): Promise<HTMLImageElement> {
  const key = `${requireCors}|${url}`;
  if (!imgCache.has(key)) {
    imgCache.set(key, new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => {
        if (requireCors) {
          imgCache.delete(key);
          reject(new Error("Image could not be loaded with CORS. Set the bucket CORS config (see README)."));
          return;
        }
        const plain = new Image();
        plain.onload = () => resolve(plain);
        plain.onerror = () => { imgCache.delete(key); reject(new Error("Image failed to load")); };
        plain.src = url;
      };
      img.src = url;
    }));
  }
  return imgCache.get(key)!;
}

