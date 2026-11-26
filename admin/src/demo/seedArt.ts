// Circus-themed sample deck for demo mode: the two illustrated cards (AS, 2D) plus
// simpler circus faces for the rest, all following the 1200×1680 template at half size.
import JSZip from "jszip";
import asArt from "./art/AS.webp?inline";
import twoArt from "./art/2D.webp?inline";

const W = 600, H = 840; // half of the 1200×1680 print template
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["S", "H", "D", "C"];
const SUIT_PATH: Record<string, string> = {
  S: "M50 4 C58 16 96 40 96 63 C96 81 78 90 60 79 C61 88 65 94 72 98 L28 98 C35 94 39 88 40 79 C22 90 4 81 4 63 C4 40 42 16 50 4Z",
  H: "M50 96 C38 82 4 62 4 34 C4 16 18 4 32 4 C42 4 48 10 50 18 C52 10 58 4 68 4 C82 4 96 16 96 34 C96 62 62 82 50 96Z",
  D: "M50 2 Q70 28 92 50 Q70 72 50 98 Q30 72 8 50 Q30 28 50 2Z",
  C: "M50 6 C64 6 72 18 70 30 C68 38 64 42 62 44 C66 40 74 38 82 40 C94 44 98 58 92 70 C86 80 70 82 60 72 C60 82 64 92 72 98 L28 98 C36 92 40 82 40 72 C30 82 14 80 8 70 C2 58 6 44 18 40 C26 38 34 40 38 44 C36 42 32 38 30 30 C28 18 36 6 50 6Z",
};
const INK: Record<string, string> = { S: "#1d1838", C: "#1d1838", H: "#c8102e", D: "#c8102e" };
const WORD: Record<string, string> = { A: "ACE", 2: "TWO", 3: "THREE", 4: "FOUR", 5: "FIVE", 6: "SIX", 7: "SEVEN", 8: "EIGHT", 9: "NINE", 10: "TEN", J: "JACK", Q: "QUEEN", K: "KING" };

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.roundRect(x, y, w, h, r);
}
function suit(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, fill = INK[s]) {
  g.save(); g.translate(x, y); g.scale(size / 100, size / 100); g.fillStyle = fill; g.fill(new Path2D(SUIT_PATH[s])); g.restore();
}
function bulbs(g: CanvasRenderingContext2D) {
  g.fillStyle = "#ffd75e";
  for (let x = 60; x <= W - 60; x += 40) for (const y of [12.5, H - 12.5]) { g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill(); }
  for (let y = 60; y <= H - 60; y += 40) for (const x of [12.5, W - 12.5]) { g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill(); }
}
function index(g: CanvasRenderingContext2D, x: number, y: number, rank: string, s: string | null, flip: boolean) {
  g.save();
  if (flip) { g.translate(x + 42.5, y + 87); g.rotate(Math.PI); g.translate(-(x + 42.5), -(y + 87)); }
  rr(g, x, y, 85, 174.5, 11); g.fillStyle = "#fbf1dc"; g.fill(); g.lineWidth = 3; g.strokeStyle = "#f2b632"; g.stroke();
  g.fillStyle = s ? INK[s] : "#7b2cbf"; g.textAlign = "center"; g.textBaseline = "alphabetic";
  g.font = `${rank === "10" ? 56 : rank.length > 2 ? 26 : 75}px Rye`;
  g.fillText(rank, x + 42.5, y + 77);
  if (s) suit(g, s, x + 13.5, y + 103, 58); else { g.font = "52px Rye"; g.fillText("★", x + 42.5, y + 155); }
  g.restore();
}

function face(key: string): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const joker = key.startsWith("JK"), rank = joker ? "JOKER" : key.slice(0, -1), s = joker ? null : key.slice(-1);
  rr(g, 0, 0, W, H, 40); g.fillStyle = "#c8102e"; g.fill(); bulbs(g);
  g.save(); rr(g, 25, 25, 550, 790, 20); g.clip();
  // big-top stripes
  for (let i = 0; i < 22; i++) {
    const a0 = Math.PI * (0.08 + (i / 22) * 0.84), a1 = Math.PI * (0.08 + ((i + 1) / 22) * 0.84);
    g.beginPath(); g.moveTo(300, -105); g.lineTo(300 + 900 * Math.cos(a0), -105 + 900 * Math.sin(a0)); g.lineTo(300 + 900 * Math.cos(a1), -105 + 900 * Math.sin(a1)); g.closePath();
    g.fillStyle = i % 2 ? "#f6e6c4" : "#d3213a"; g.fill();
  }
  const spot = g.createRadialGradient(300, 60, 10, 300, 300, 420); spot.addColorStop(0, "rgba(255,250,225,.55)"); spot.addColorStop(1, "rgba(255,250,225,0)");
  g.fillStyle = spot; g.fillRect(0, 0, W, H);
  g.beginPath(); g.ellipse(300, 530, 320, 75, 0, 0, 7); g.fillStyle = "#9b0e25"; g.fill(); g.lineWidth = 7; g.strokeStyle = "#f2b632"; g.stroke();
  for (let x = 5, i = 0; x < 580; x += 55, i++) {
    g.beginPath(); g.moveTo(x, 25); g.lineTo(x + 55, 25); g.lineTo(x + 55, 48); g.quadraticCurveTo(x + 27.5, 84, x, 48); g.closePath();
    g.fillStyle = i % 2 ? "#f2b632" : "#c8102e"; g.fill(); g.lineWidth = 2; g.strokeStyle = "#8e0b22"; g.stroke();
  }
  // emblem
  g.beginPath(); g.arc(300, 265, 125, 0, 7); g.fillStyle = "#fbf1dc"; g.fill(); g.lineWidth = 8; g.strokeStyle = "#f2b632"; g.stroke();
  g.setLineDash([2, 9]); g.beginPath(); g.arc(300, 265, 111, 0, 7); g.lineWidth = 2.5; g.strokeStyle = s ? INK[s] : "#7b2cbf"; g.stroke(); g.setLineDash([]);
  if (s) suit(g, s, 217, 182, 166);
  else { g.fillStyle = "#7b2cbf"; g.font = "170px Rye"; g.textAlign = "center"; g.fillText("★", 300, 330); }
  // ribbon
  g.beginPath(); g.moveTo(150, 380); g.lineTo(450, 380); g.lineTo(430, 405); g.lineTo(450, 430); g.lineTo(150, 430); g.lineTo(170, 405); g.closePath();
  g.fillStyle = "#c8102e"; g.fill(); g.lineWidth = 3; g.strokeStyle = "#8e0b22"; g.stroke();
  g.fillStyle = "#fbf1dc"; g.font = "32px Rye"; g.textAlign = "center"; g.fillText(WORD[rank] ?? "JOKER", 300, 418);
  // action panel
  g.fillStyle = "#1d1838"; g.fillRect(25, 525, 550, 290);
  g.fillStyle = "#f2b632"; g.fillRect(25, 525, 550, 7);
  g.restore();
  index(g, 50, 50, joker ? "JK" : rank, s, false);
  index(g, 463.5, 615, joker ? "JK" : rank, s, true);
  return c;
}

function back(): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, W, H); grad.addColorStop(0, "#5a189a"); grad.addColorStop(1, "#240046");
  rr(g, 0, 0, W, H, 40); g.fillStyle = grad; g.fill();
  g.save(); rr(g, 30, 30, 540, 780, 22); g.clip();
  g.strokeStyle = "rgba(224,170,255,.22)"; g.lineWidth = 2;
  for (let y = 0; y < H; y += 40) for (let x = (y / 40) % 2 ? 20 : 0; x < W; x += 40) { g.beginPath(); g.moveTo(x, y - 17); g.lineTo(x + 17, y); g.lineTo(x, y + 17); g.lineTo(x - 17, y); g.closePath(); g.stroke(); }
  g.restore();
  rr(g, 30, 30, 540, 780, 22); g.lineWidth = 6; g.strokeStyle = "#e0aaff"; g.stroke();
  g.beginPath(); g.arc(300, 380, 150, 0, 7); g.fillStyle = "#240046"; g.fill(); g.lineWidth = 7; g.strokeStyle = "#e0aaff"; g.stroke();
  // crown
  g.beginPath(); g.moveTo(215, 425); g.lineTo(205, 320); g.lineTo(255, 365); g.lineTo(300, 295); g.lineTo(345, 365); g.lineTo(395, 320); g.lineTo(385, 425); g.closePath();
  g.fillStyle = "#f2b632"; g.fill(); g.lineWidth = 5; g.strokeStyle = "#b47a12"; g.stroke();
  g.fillRect(215, 425, 170, 22);
  for (const [x, y] of [[205, 320], [300, 295], [395, 320]]) { g.beginPath(); g.arc(x, y, 11, 0, 7); g.fillStyle = "#fbf1dc"; g.fill(); }
  g.fillStyle = "#e0aaff"; g.textAlign = "center"; g.font = "60px Rye"; g.fillText("KINGS CUP", 300, 615);
  g.font = "700 24px 'Barlow Condensed', sans-serif"; g.fillStyle = "rgba(224,170,255,.8)"; g.fillText("T H E   B I G   T O P", 300, 655);
  return c;
}

async function fromImage(src: string) {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  c.getContext("2d")!.drawImage(img, 0, 0, W, H);
  return c;
}
const png = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));

/** Builds the 55-image zip (same naming as a real upload). */
export async function circusDeckZip(onCard?: (n: number) => void) {
  await Promise.all(["40px Rye", "700 24px 'Barlow Condensed'"].map((f) => document.fonts.load(f).catch(() => undefined)));
  const zip = new JSZip();
  let n = 0;
  for (const s of SUITS) for (const r of RANKS) {
    const key = `${r}${s}`;
    const c = key === "AS" ? await fromImage(asArt) : key === "2D" ? await fromImage(twoArt) : face(key);
    zip.file(`Circus/${key}.png`, await png(c)); onCard?.(++n);
  }
  zip.file("Circus/JK1.png", await png(face("JK1")));
  zip.file("Circus/JK2.png", await png(face("JK2")));
  zip.file("Circus/BACK.png", await png(back()));
  return zip.generateAsync({ type: "uint8array" });
}

export const CIRCUS_ACTIONS: Record<string, { en: [string, string]; ms: [string, string] }> = {
  A: { en: ["Blind Prophecy", "A player closes their eyes while another points at someone and says either 'drink' or 'don't drink.' If 'drink' is called, the person pointed at must take a shot."], ms: ["Ramalan Buta", "Seorang pemain tutup mata sementara seorang lagi menunjuk seseorang dan berkata 'minum' atau 'jangan minum'. Jika 'minum', orang yang ditunjuk mesti minum satu shot."] },
  2: { en: ["Human Cannonball", "Light the fuse! Pick two players to fire out of the cannon. Both take a drink. The first one to finish picks who drinks next round."], ms: ["Peluru Meriam", "Nyalakan fius! Pilih dua pemain untuk ditembak keluar dari meriam. Kedua-duanya minum. Yang pertama habis memilih siapa minum pusingan seterusnya."] },
  3: { en: ["Sword Swallower", "That's you. Take a drink like a pro."], ms: ["Penelan Pedang", "Giliran anda. Minum macam profesional."] },
  4: { en: ["Trapdoor", "Last person to touch the floor drinks."], ms: ["Pintu Perangkap", "Orang terakhir menyentuh lantai minum."] },
  5: { en: ["Strongmen", "All the guys drink."], ms: ["Lelaki Gagah", "Semua lelaki minum."] },
  6: { en: ["Showgirls", "All the girls drink."], ms: ["Gadis Pentas", "Semua perempuan minum."] },
  7: { en: ["High Wire", "Last person to point to the sky drinks."], ms: ["Tali Tinggi", "Orang terakhir menunjuk ke langit minum."] },
  8: { en: ["Partners in Crime", "Pick a mate. Whenever you drink, they drink too."], ms: ["Rakan Jenayah", "Pilih pasangan. Setiap kali anda minum, dia pun minum."] },
  9: { en: ["Ringmaster's Rhyme", "Say a word. Go round rhyming. First to fail drinks."], ms: ["Pantun Pengacara", "Sebut satu perkataan. Bergilir berima. Yang pertama gagal minum."] },
  10: { en: ["Freak Show", "Pick a category. Go round naming things in it. First to fail drinks."], ms: ["Pertunjukan Aneh", "Pilih satu kategori. Bergilir menyebut benda dalam kategori itu. Yang gagal minum."] },
  J: { en: ["Ringmaster's Law", "Make a rule. Anyone who breaks it drinks."], ms: ["Undang-undang Pengacara", "Buat satu peraturan. Sesiapa yang melanggarnya minum."] },
  Q: { en: ["Riddle Queen", "You're the Question Master. Anyone who answers your question drinks."], ms: ["Ratu Teka-teki", "Anda Ketua Soalan. Sesiapa yang menjawab soalan anda minum."] },
  K: { en: ["King's Cup", "Pour some of your drink into the cup. Whoever draws the 4th King drinks it all!"], ms: ["Cawan Raja", "Tuang sedikit minuman anda ke dalam cawan. Siapa dapat Raja ke-4 habiskan semuanya!"] },
  JOKER: { en: ["Wild Card", "Pick any card's action and play it."], ms: ["Kad Bebas", "Pilih mana-mana tindakan kad dan mainkannya."] },
};
