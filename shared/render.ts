// Card renderer shared by the admin dashboard (preview + print export) and the player app,
// so what staff preview is exactly what players see.
import { TextStyle, TextBox, rankOf } from "./cards";

export function fontKey(fontId: string) {
  return `kcfont-${fontId}`;
}

function family(fontId: string | null | undefined, name: string | undefined) {
  return fontId ? `"${fontKey(fontId)}", "${name || "Arial"}"` : `"${name || "Arial"}"`;
}
export function familyFor(style: TextStyle) {
  return family(style.fontId, style.fontFamily);
}
export function titleFamilyFor(style: TextStyle) {
  return style.titleFontId || style.titleFontFamily ? family(style.titleFontId, style.titleFontFamily) : familyFor(style);
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

/** Draws art + action text onto a canvas sized to the art (or `size`). */
export function drawCard(
  canvas: HTMLCanvasElement, img: CanvasImageSource | null, style: TextStyle, content: CardText | null,
  box: TextBox, size?: { width: number; height: number },
) {
  const natural = img as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number } | null;
  const W = size?.width ?? natural?.naturalWidth ?? (natural?.width as number) ?? 750;
  const H = size?.height ?? natural?.naturalHeight ?? (natural?.height as number) ?? 1050;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  if (img) ctx.drawImage(img, 0, 0, W, H);
  else { ctx.fillStyle = "#f1f3f5"; ctx.fillRect(0, 0, W, H); }
  if (!content || (!content.title && !content.text)) return;

  const bx = (box.x / 100) * W, by = (box.y / 100) * H, bw = (box.w / 100) * W, bh = (box.h / 100) * H;
  const body = familyFor(style), titleFam = titleFamilyFor(style);
  const tf = (s: string) => (style.uppercase ? s.toUpperCase() : s);
  const title = style.showTitle ? tf(content.title || "") : "";
  const text = tf(content.text || "");

  // Shrink to fit the box.
  let fs = (style.sizePct / 100) * W;
  let titleLines: string[] = [], bodyLines: string[] = [], titleFs = 0, total = 0;
  for (let i = 0; i < 30; i++) {
    titleFs = fs * 1.3;
    ctx.font = `bold ${titleFs}px ${titleFam}`;
    titleLines = title ? wrap(ctx, title, bw) : [];
    ctx.font = `${style.bold ? "bold " : ""}${fs}px ${body}`;
    bodyLines = text ? wrap(ctx, text, bw) : [];
    total = titleLines.length * titleFs * 1.15 + (title && text ? fs * 0.35 : 0) + bodyLines.length * fs * 1.2;
    if (total <= bh || fs < (style.sizePct / 100) * W * 0.35) break;
    fs *= 0.92;
  }

  let y = style.vAlign === "top" ? by : style.vAlign === "bottom" ? by + bh - total : by + (bh - total) / 2;
  const x = style.align === "left" ? bx : style.align === "right" ? bx + bw : bx + bw / 2;
  ctx.textAlign = style.align;
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  ctx.strokeStyle = style.strokeColor;
  const line = (t: string, size: number) => {
    if (style.strokeWidth > 0) { ctx.lineWidth = (style.strokeWidth / 100) * size * 2; ctx.strokeText(t, x, y); }
    ctx.fillText(t, x, y);
  };
  ctx.fillStyle = style.titleColor || style.color;
  ctx.font = `bold ${titleFs}px ${titleFam}`;
  for (const t of titleLines) { line(t, titleFs); y += titleFs * 1.15; }
  if (title && text) y += fs * 0.35;
  ctx.fillStyle = style.color;
  ctx.font = `${style.bold ? "bold " : ""}${fs}px ${body}`;
  for (const t of bodyLines) { line(t, fs); y += fs * 1.2; }
}

/** Resolves the text + box for a card, honouring per-card overrides and language fallback. */
export function contentFor(deck: any, cardKey: string, lang: string): { content: CardText | null; box: TextBox } {
  const style: TextStyle = deck.textStyle;
  const ov = deck.cardOverrides?.[cardKey] ?? {};
  const box: TextBox = ov.box ?? style.box;
  if (cardKey === "BACK") return { content: null, box };
  const rank = rankOf(cardKey);
  const t = ov.text?.[lang] ?? deck.actions?.[rank]?.[lang] ?? deck.actions?.[rank]?.[deck.defaultLanguage] ?? null;
  return { content: t, box };
}
