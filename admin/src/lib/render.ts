import { TextStyle, TextBox, rankOf } from "./cards";
import { storageUrl } from "./hooks";

/**
 * One renderer for both the on-screen preview and the print export, so what you
 * see is exactly what gets printed (and what the mobile app should replicate).
 */

export const SYSTEM_FONTS = ["Arial", "Helvetica", "Georgia", "Times New Roman", "Verdana", "Trebuchet MS", "Impact", "Courier New"];

export interface FontDoc { id: string; name: string; path: string }

const loadedFonts = new Map<string, Promise<void>>();

export function fontKey(fontId: string) {
  return `kcfont-${fontId}`;
}

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

export function familyFor(style: TextStyle) {
  return style.fontId ? `"${fontKey(style.fontId)}", ${style.fontFamily || "Arial"}` : `"${style.fontFamily || "Arial"}"`;
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

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
    let line = words[0];
    for (const w of words.slice(1)) {
      if (ctx.measureText(`${line} ${w}`).width <= maxWidth) line = `${line} ${w}`;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

export interface CardText { title: string; text: string }

/** Draws art + action text onto a canvas sized to the art. */
export function drawCard(
  canvas: HTMLCanvasElement, img: HTMLImageElement | null, style: TextStyle, content: CardText | null,
  box: TextBox, size?: { width: number; height: number },
) {
  const W = size?.width ?? img?.naturalWidth ?? 750;
  const H = size?.height ?? img?.naturalHeight ?? 1050;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  if (img) ctx.drawImage(img, 0, 0, W, H);
  else { ctx.fillStyle = "#f1f3f5"; ctx.fillRect(0, 0, W, H); }
  if (!content || (!content.title && !content.text)) return;

  const bx = (box.x / 100) * W, by = (box.y / 100) * H, bw = (box.w / 100) * W, bh = (box.h / 100) * H;
  const family = familyFor(style);
  const tf = (s: string) => (style.uppercase ? s.toUpperCase() : s);
  const title = style.showTitle ? tf(content.title || "") : "";
  const body = tf(content.text || "");

  // Shrink to fit the box.
  let fs = (style.sizePct / 100) * W;
  let titleLines: string[] = [], bodyLines: string[] = [], titleFs = 0, total = 0;
  for (let i = 0; i < 30; i++) {
    titleFs = fs * 1.3;
    ctx.font = `bold ${titleFs}px ${family}`;
    titleLines = title ? wrap(ctx, title, bw) : [];
    ctx.font = `${style.bold ? "bold " : ""}${fs}px ${family}`;
    bodyLines = body ? wrap(ctx, body, bw) : [];
    total = titleLines.length * titleFs * 1.15 + (title && body ? fs * 0.35 : 0) + bodyLines.length * fs * 1.2;
    if (total <= bh || fs < (style.sizePct / 100) * W * 0.35) break;
    fs *= 0.92;
  }

  let y = style.vAlign === "top" ? by : style.vAlign === "bottom" ? by + bh - total : by + (bh - total) / 2;
  const x = style.align === "left" ? bx : style.align === "right" ? bx + bw : bx + bw / 2;
  ctx.textAlign = style.align;
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  ctx.fillStyle = style.color;
  ctx.strokeStyle = style.strokeColor;
  const line = (t: string, size: number) => {
    if (style.strokeWidth > 0) { ctx.lineWidth = (style.strokeWidth / 100) * size * 2; ctx.strokeText(t, x, y); }
    ctx.fillText(t, x, y);
  };
  ctx.font = `bold ${titleFs}px ${family}`;
  for (const t of titleLines) { line(t, titleFs); y += titleFs * 1.15; }
  if (title && body) y += fs * 0.35;
  ctx.font = `${style.bold ? "bold " : ""}${fs}px ${family}`;
  for (const t of bodyLines) { line(t, fs); y += fs * 1.2; }
}

/** Resolves the text + box for a card, honouring per-card overrides. */
export function contentFor(deck: any, cardKey: string, lang: string): { content: CardText | null; box: TextBox } {
  const style: TextStyle = deck.textStyle;
  const ov = deck.cardOverrides?.[cardKey] ?? {};
  const box: TextBox = ov.box ?? style.box;
  if (cardKey === "BACK") return { content: null, box };
  const rank = rankOf(cardKey);
  const t = ov.text?.[lang] ?? deck.actions?.[rank]?.[lang] ?? deck.actions?.[rank]?.[deck.defaultLanguage] ?? null;
  return { content: t, box };
}
