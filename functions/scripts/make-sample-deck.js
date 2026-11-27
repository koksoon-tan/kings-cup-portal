/**
 * Draws a plain sample deck (52 cards + 2 jokers + back) and zips it, ready to upload on
 * Deck designs → New deck. For testing the upload and the player app; not print art.
 *
 *   node scripts/make-sample-deck.js [output.zip]      (default: ../sample-decks/sample-deck.zip)
 *
 * Cards are 1200×1680 px at 300 DPI (the print template). The lower part of each card is a
 * blank panel that matches the dashboard's default action text box (x 12%–88%, y 62%–88%).
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const JSZip = require("jszip");

const W = 1200, H = 1680;
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["S", "H", "D", "C"];
const SYMBOL = { S: "♠", H: "♥", D: "♦", C: "♣" };
const INK = { S: "#1d1838", C: "#1d1838", H: "#c8102e", D: "#c8102e" };
const NAME = { A: "ACE", J: "JACK", Q: "QUEEN", K: "KING" };
const FONT = "Georgia, 'Times New Roman', serif";

const frame = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" rx="70" fill="#fbf6ea"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="44" fill="none" stroke="#d9b45a" stroke-width="8"/>
  ${inner}
  <rect x="${W * 0.12}" y="${H * 0.62}" width="${W * 0.76}" height="${H * 0.26}" rx="30" fill="#ffffff" stroke="#e6dcc4" stroke-width="4"/>
</svg>`;

const corner = (label, sym, color) => `
  <g fill="${color}" font-family="${FONT}" font-weight="bold" text-anchor="middle">
    <text x="130" y="200" font-size="${label.length > 1 ? 110 : 140}">${label}</text>
    <text x="130" y="320" font-size="120">${sym}</text>
  </g>`;

function cardSvg(rank, suit) {
  const color = INK[suit], sym = SYMBOL[suit];
  const centre = NAME[rank]
    ? `<text x="${W / 2}" y="640" font-size="520" text-anchor="middle" fill="${color}" font-family="${FONT}" font-weight="bold">${rank}</text>
       <text x="${W / 2}" y="830" font-size="110" text-anchor="middle" fill="${color}" font-family="${FONT}" letter-spacing="12">${sym} ${NAME[rank]} ${sym}</text>`
    : `<text x="${W / 2}" y="760" font-size="640" text-anchor="middle" fill="${color}">${sym}</text>`;
  return frame(corner(rank, sym, color) + centre);
}

function jokerSvg(n) {
  const color = n === 1 ? "#7b2cbf" : "#c8102e";
  return frame(corner("JK", "★", color) + `
    <text x="${W / 2}" y="700" font-size="560" text-anchor="middle" fill="${color}">★</text>
    <text x="${W / 2}" y="870" font-size="130" text-anchor="middle" fill="${color}" font-family="${FONT}" font-weight="bold" letter-spacing="20">JOKER</text>`);
}

function backSvg() {
  let diamonds = "";
  for (let y = 0; y < H; y += 80) for (let x = (y / 80) % 2 ? 40 : 0; x < W; x += 80)
    diamonds += `<path d="M${x} ${y - 34} L${x + 34} ${y} L${x} ${y + 34} L${x - 34} ${y} Z" fill="none" stroke="rgba(224,170,255,0.25)" stroke-width="4"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a189a"/><stop offset="1" stop-color="#240046"/></linearGradient></defs>
    <rect width="${W}" height="${H}" rx="70" fill="url(#g)"/>
    ${diamonds}
    <rect x="60" y="60" width="${W - 120}" height="${H - 120}" rx="44" fill="none" stroke="#e0aaff" stroke-width="12"/>
    <circle cx="${W / 2}" cy="760" r="300" fill="#240046" stroke="#e0aaff" stroke-width="14"/>
    <path d="M430 850 L410 640 L510 730 L600 590 L690 730 L790 640 L770 850 Z" fill="#f2b632" stroke="#b47a12" stroke-width="10"/>
    <rect x="430" y="850" width="340" height="44" fill="#f2b632"/>
    <text x="${W / 2}" y="1240" font-size="120" text-anchor="middle" fill="#e0aaff" font-family="${FONT}" font-weight="bold">KINGS CUP</text>
    <text x="${W / 2}" y="1320" font-size="48" text-anchor="middle" fill="#e0aaff" font-family="${FONT}" letter-spacing="16">SAMPLE DECK</text>
  </svg>`;
}

const png = (svg) => sharp(Buffer.from(svg)).withMetadata({ density: 300 }).png().toBuffer();

async function main() {
  const out = path.resolve(process.argv[2] ?? path.join(__dirname, "../../sample-decks/sample-deck.zip"));
  const zip = new JSZip();
  for (const s of SUITS) for (const r of RANKS) zip.file(`SampleDeck/${r}${s}.png`, await png(cardSvg(r, s)));
  zip.file("SampleDeck/JK1.png", await png(jokerSvg(1)));
  zip.file("SampleDeck/JK2.png", await png(jokerSvg(2)));
  zip.file("SampleDeck/BACK.png", await png(backSvg()));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }));
  console.log(`Wrote ${Object.keys(zip.files).filter((f) => f.endsWith(".png")).length} cards to ${out}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
