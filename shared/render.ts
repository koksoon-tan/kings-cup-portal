// Card renderer shared by the admin dashboard (preview + print export) and the player app,
// so what staff preview is exactly what players see.
import { TextStyle, TextBox, TitleStyle, rankOf } from "./cards";

export function fontKey(fontId: string) {
  return `kcfont-${fontId}`;
}

export function familyFor(style: { fontId?: string | null; fontFamily?: string }) {
  return style.fontId ? `"${fontKey(style.fontId)}", ${style.fontFamily || "Arial"}` : `"${style.fontFamily || "Arial"}"`;
}

/** Title style with every gap filled from the action text style. */
export function resolveTitle(style: TextStyle) {
  const t: TitleStyle = style.title ?? {};
  const fontId = t.fontId !== undefined ? t.fontId : style.fontId;
  return {
    fontId,
    fontFamily: t.fontFamily ?? style.fontFamily,
    color: t.color ?? style.color,
    sizePct: t.sizePct ?? style.sizePct * 1.3,
    align: t.align ?? style.align,
    bold: t.bold ?? true,
    uppercase: t.uppercase ?? style.uppercase,
    strokeColor: t.strokeColor ?? style.strokeColor,
    strokeWidth: t.strokeWidth ?? style.strokeWidth,
  };
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

/** Draws art + action text onto a canvas sized to the art (or `size`). Accepts images or bitmaps. */
export function drawCard(
  canvas: HTMLCanvasElement, img: CanvasImageSource | null, style: TextStyle, content: CardText | null,
  box: TextBox, size?: { width: number; height: number },
) {
  const im = img as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number } | null;
  const W = size?.width ?? (im?.naturalWidth || (im?.width as number)) ?? 750;
  const H = size?.height ?? (im?.naturalHeight || (im?.height as number)) ?? 1050;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  if (img) ctx.drawImage(img, 0, 0, W, H);
  else { ctx.fillStyle = "#f1f3f5"; ctx.fillRect(0, 0, W, H); }
  if (!content || (!content.title && !content.text)) return;

  const bx = (box.x / 100) * W, by = (box.y / 100) * H, bw = (box.w / 100) * W, bh = (box.h / 100) * H;
  const family = familyFor(style);
  const ts = resolveTitle(style);
  const tfBody = (s: string) => (style.uppercase ? s.toUpperCase() : s);
  const tfTitle = (s: string) => (ts.uppercase ? s.toUpperCase() : s);
  const title = style.showTitle ? tfTitle(content.title || "") : "";
  const body = tfBody(content.text || "");
  const titleFamily = familyFor(ts);
  // Title and action text scale together so the box still fits; their ratio stays as set.
  const titleRatio = ts.sizePct / style.sizePct;

  // Shrink to fit the box.
  let fs = (style.sizePct / 100) * W;
  let titleLines: string[] = [], bodyLines: string[] = [], titleFs = 0, total = 0;
  for (let i = 0; i < 30; i++) {
    titleFs = fs * titleRatio;
    ctx.font = `${ts.bold ? "bold " : ""}${titleFs}px ${titleFamily}`;
    titleLines = title ? wrap(ctx, title, bw) : [];
    ctx.font = `${style.bold ? "bold " : ""}${fs}px ${family}`;
    bodyLines = body ? wrap(ctx, body, bw) : [];
    total = titleLines.length * titleFs * 1.15 + (title && body ? fs * 0.35 : 0) + bodyLines.length * fs * 1.2;
    if (total <= bh || fs < (style.sizePct / 100) * W * 0.35) break;
    fs *= 0.92;
  }

  let y = style.vAlign === "top" ? by : style.vAlign === "bottom" ? by + bh - total : by + (bh - total) / 2;
  const xFor = (align: "left" | "center" | "right") => (align === "left" ? bx : align === "right" ? bx + bw : bx + bw / 2);
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  const line = (t: string, size: number, o: { align: "left" | "center" | "right"; color: string; strokeColor: string; strokeWidth: number }) => {
    ctx.textAlign = o.align;
    ctx.fillStyle = o.color;
    ctx.strokeStyle = o.strokeColor;
    const x = xFor(o.align);
    if (o.strokeWidth > 0) { ctx.lineWidth = (o.strokeWidth / 100) * size * 2; ctx.strokeText(t, x, y); }
    ctx.fillText(t, x, y);
  };
  ctx.font = `${ts.bold ? "bold " : ""}${titleFs}px ${titleFamily}`;
  for (const t of titleLines) { line(t, titleFs, ts); y += titleFs * 1.15; }
  if (title && body) y += fs * 0.35;
  ctx.font = `${style.bold ? "bold " : ""}${fs}px ${family}`;
  for (const t of bodyLines) { line(t, fs, style); y += fs * 1.2; }
}

/**
 * Resolves the text + box for a card, honouring per-card overrides and language fallback.
 * `deck.actions` is the global action text (settings/actions), merged onto the deck by the caller.
 */
export function contentFor(deck: any, cardKey: string, lang: string): { content: CardText | null; box: TextBox } {
  const style: TextStyle = deck.textStyle;
  const ov = deck.cardOverrides?.[cardKey] ?? {};
  const box: TextBox = ov.box ?? style.box;
  if (cardKey === "BACK") return { content: null, box };
  const rank = rankOf(cardKey);
  const t = ov.text?.[lang] ?? deck.actions?.[rank]?.[lang] ?? deck.actions?.[rank]?.[deck.defaultLanguage] ?? deck.actions?.[rank]?.en ?? null;
  return { content: t, box };
}
