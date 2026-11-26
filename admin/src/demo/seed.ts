// Builds a realistic demo dataset by calling the real function handlers.
import JSZip from "jszip";
import { users, commit, store, files, Timestamp, saveUsers, newId } from "./core";
import { invoke } from "./client-functions";

export const DEMO_PASSWORD = "kingscup2026";
export const DEMO_USERS = [
  { email: "admin@demo.test", role: "superadmin", name: "Alex (Owner)" },
  { email: "ops@demo.test", role: "ops", name: "Olivia (Operations)" },
  { email: "sales@demo.test", role: "sales", name: "Sam (Sales)" },
];

export const isSeeded = () => store.has("_demo/meta");

const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS: [string, string, string][] = [["S", "♠", "#1a1a2e"], ["H", "♥", "#c1121f"], ["D", "♦", "#c1121f"], ["C", "♣", "#1a1a2e"]];

async function cardPng(label: string, symbol: string, ink: string, back = false): Promise<Blob> {
  const W = 750, H = 1050;
  const c = new OffscreenCanvas(W, H);
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, W, H);
  if (back) { grad.addColorStop(0, "#5a189a"); grad.addColorStop(1, "#240046"); }
  else { grad.addColorStop(0, "#fffaf0"); grad.addColorStop(1, "#f3e8ff"); }
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.strokeStyle = back ? "#e0aaff" : "#7b2cbf"; g.lineWidth = 14; g.strokeRect(28, 28, W - 56, H - 56);
  if (back) {
    g.fillStyle = "#e0aaff"; g.font = "bold 220px Georgia"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("👑", W / 2, H / 2 - 60);
    g.font = "bold 72px Georgia"; g.fillText("KINGS CUP", W / 2, H / 2 + 140);
  } else {
    g.fillStyle = ink; g.textAlign = "left"; g.textBaseline = "top";
    g.font = "bold 110px Georgia"; g.fillText(label, 70, 60);
    g.font = "90px Georgia"; g.fillText(symbol, 76, 180);
    g.textAlign = "center"; g.textBaseline = "middle"; g.globalAlpha = 0.9;
    g.font = "300px Georgia"; g.fillText(symbol, W / 2, H * 0.36);
    g.globalAlpha = 0.12; g.fillStyle = "#7b2cbf"; g.fillRect(70, H * 0.58, W - 140, H * 0.32);
  }
  return c.convertToBlob({ type: "image/png" });
}

async function deckZip() {
  const zip = new JSZip();
  for (const [s, sym, ink] of SUITS) for (const r of RANKS) zip.file(`Classic/${r}${s}.png`, await cardPng(r, sym, ink));
  zip.file("Classic/JK1.png", await cardPng("JOKER", "★", "#7b2cbf"));
  zip.file("Classic/JK2.png", await cardPng("JOKER", "★", "#c1121f"));
  zip.file("Classic/BACK.png", await cardPng("", "", "", true));
  return zip.generateAsync({ type: "uint8array" });
}

const ACTIONS: Record<string, [string, string, string, string]> = {
  A: ["Waterfall", "Everyone drinks. You can only stop when the person before you stops.", "Air Terjun", "Semua minum. Berhenti hanya bila orang sebelum anda berhenti."],
  2: ["You", "Pick someone to drink.", "Kamu", "Pilih seorang untuk minum."],
  3: ["Me", "You drink.", "Saya", "Anda minum."],
  4: ["Floor", "Last person to touch the floor drinks.", "Lantai", "Orang terakhir sentuh lantai minum."],
  5: ["Guys", "All the guys drink.", "Lelaki", "Semua lelaki minum."],
  6: ["Chicks", "All the girls drink.", "Perempuan", "Semua perempuan minum."],
  7: ["Heaven", "Last person to point up drinks.", "Syurga", "Orang terakhir tunjuk ke atas minum."],
  8: ["Mate", "Pick a drinking buddy for the rest of the game.", "Kawan", "Pilih kawan minum sepanjang permainan."],
  9: ["Rhyme", "Say a word. Go around rhyming. First to fail drinks.", "Pantun", "Sebut satu perkataan, semua berima. Yang gagal minum."],
  10: ["Categories", "Pick a category. Go around naming things in it.", "Kategori", "Pilih kategori, semua sebut satu benda."],
  J: ["Make a Rule", "Create a rule everyone must follow.", "Buat Peraturan", "Cipta peraturan yang semua mesti ikut."],
  Q: ["Questions", "Ask someone a question. Answer only with questions.", "Soalan", "Tanya soalan. Jawab hanya dengan soalan."],
  K: ["King's Cup", "Pour some of your drink into the cup. The 4th King drinks it all!", "Cawan Raja", "Tuang sedikit minuman ke dalam cawan. Raja ke-4 habiskan!"],
  JOKER: ["Wild Card", "Choose any card's action.", "Kad Bebas", "Pilih mana-mana tindakan kad."],
};

const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();

export async function seedDemo(onStep: (s: string) => void) {
  // ---- staff
  onStep("Creating staff accounts");
  const ownerUid = "demo-owner";
  users[ownerUid] = { uid: ownerUid, email: DEMO_USERS[0].email, password: DEMO_PASSWORD, displayName: DEMO_USERS[0].name, claims: { role: "superadmin" } };
  saveUsers();
  commit([{ op: "set", path: `staff/${ownerUid}`, data: { email: DEMO_USERS[0].email, displayName: DEMO_USERS[0].name, role: "superadmin", disabled: false, createdAt: Timestamp.now(), createdBy: "demo" } }]);
  const call = (name: string, data: unknown) => invoke(name, data, ownerUid);
  for (const u of DEMO_USERS.slice(1)) await call("createStaff", { email: u.email, displayName: u.name, role: u.role, password: DEMO_PASSWORD });

  // ---- settings
  onStep("Saving settings");
  commit([
    { op: "set", path: "settings/general", data: { currency: "MYR", autoIssueCodeOnPaid: true, codeExpiryDays: 0, defaultLocation: "main", locations: [{ id: "main", name: "KL warehouse" }, { id: "shopee_fbs", name: "Fulfilled by Shopee" }] } },
    { op: "set", path: "settings/company", data: { name: "Kings Cup Games Sdn Bhd", regNo: "202601012345 (1590001-X)", taxId: "W10-2601-32000123", address: "Level 8, Menara Demo, Jalan Ampang, 50450 Kuala Lumpur", email: "billing@kingscup.demo", phone: "+60 3-1234 5678", bankDetails: "Maybank · Kings Cup Games Sdn Bhd · 5140 1234 5678", invoiceFooter: "Thank you for partying with Kings Cup!", taxRate: 8, taxLabel: "SST", paymentTermsDays: 14 } },
  ]);

  // ---- decks
  onStep("Drawing 55 cards for the Classic deck");
  const deckId = newId();
  const actions = Object.fromEntries(Object.entries(ACTIONS).map(([k, [t, x, tm, xm]]) => [k, { en: { title: t, text: x }, ms: { title: tm, text: xm } }]));
  commit([{ op: "set", path: "settings/actions", data: { actions } }]);
  commit([{ op: "set", path: `decks/${deckId}`, data: {
    name: "Kings Cup Classic", code: "CLASSIC-01", type: "inhouse", corporateId: null, designer: null, status: "published",
    languages: ["en", "ms"], defaultLanguage: "en", countries: ["MY", "SG"], appAccess: "purchase", appPrice: 0, expiryDate: null,
    description: "Our launch deck — sold on Kickstarter, Shopee, Lazada and the website.", cardOverrides: {},
    textStyle: { fontId: null, fontFamily: "Georgia", color: "#3c096c", sizePct: 5.2, align: "center", vAlign: "middle", bold: true, uppercase: false, strokeColor: "#ffffff", strokeWidth: 0, showTitle: true, box: { x: 12, y: 59, w: 76, h: 30 } },
    upload: { status: "uploading", errors: [], warnings: [] }, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  } }]);
  const zip = await deckZip();
  onStep("Processing card art (validating + previews)");
  await files.put(`decks/${deckId}/uploads/seed.zip`, zip, "application/zip");
  await files.finalize(`decks/${deckId}/uploads/seed.zip`);

  const corpDeck = newId();
  commit([{ op: "set", path: `decks/${corpDeck}`, data: {
    name: "Velvet Lounge — VIP Night", code: "VELVET-01", type: "external", corporateId: null, designer: { name: "Nadia Studio", email: "nadia@studio.demo", royaltyPct: 12 },
    status: "draft", languages: ["en"], defaultLanguage: "en", countries: ["MY"], appAccess: "paid", appPrice: 4.9, expiryDate: null, description: "",
    cardOverrides: {}, textStyle: { fontId: null, fontFamily: "Arial", color: "#111111", sizePct: 5.5, align: "center", vAlign: "middle", bold: true, uppercase: false, strokeColor: "#ffffff", strokeWidth: 0, showTitle: true, box: { x: 12, y: 62, w: 76, h: 26 } },
    upload: { status: "none", errors: [], warnings: [] }, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  } }]);

  // ---- inventory
  onStep("Receiving print runs");
  const sku = (id: string, name: string, kind: string, low: number, allocation: Record<string, number> = {}) =>
    commit([{ op: "set", path: `inventory/${id}`, data: { name, deckId: kind === "retail" ? deckId : null, kind, corporateId: null, lowStockThreshold: low, allocation, onHand: 0, reserved: 0, active: true, createdAt: Timestamp.now(), updatedAt: Timestamp.now() } }]);
  sku("KC-CLASSIC-EN", "Kings Cup Classic (English)", "retail", 50, { shopee: 150, lazada: 100 });
  sku("KC-CLASSIC-MS", "Kings Cup Classic (Bahasa)", "retail", 30);
  sku("KC-SAMPLE-LOGO", "Sample deck — 'Your Company Logo'", "sample", 10);
  await call("adjustStock", { sku: "KC-CLASSIC-EN", type: "stock_in", qty: 500, location: "main", unitCost: 6.5, poNumber: "PRN-2026-001", note: "First print run" });
  await call("adjustStock", { sku: "KC-CLASSIC-EN", type: "transfer", qty: 60, location: "main", toLocation: "shopee_fbs", note: "Send to Shopee fulfilment" });
  await call("adjustStock", { sku: "KC-CLASSIC-MS", type: "stock_in", qty: 40, location: "main", unitCost: 6.8, poNumber: "PRN-2026-002" });
  await call("adjustStock", { sku: "KC-SAMPLE-LOGO", type: "stock_in", qty: 30, location: "main", unitCost: 9, poNumber: "PRN-2026-003" });
  await call("adjustStock", { sku: "KC-CLASSIC-EN", type: "damage", qty: 3, location: "main", note: "Water damage in transit" });

  // ---- orders
  onStep("Importing Kickstarter backers");
  const ks = [
    ["KS-1001", "Aisyah Rahman", "aisyah@mail.demo", "2", "79", "shipped", 20], ["KS-1002", "Daniel Lim", "daniel.lim@mail.demo", "1", "79", "delivered", 20],
    ["KS-1003", "Priya Nair", "priya@mail.demo", "3", "75", "shipped", 19], ["KS-1004", "Marcus Tan", "marcus.tan@mail.demo", "1", "79", "paid", 18],
    ["KS-1005", "Hana Yusof", "hana@mail.demo", "2", "79", "paid", 18], ["KS-1006", "Jason Wong", "jason@mail.demo", "1", "79", "packing", 17],
  ];
  await call("importOrders", { source: "kickstarter", location: "main", rows: ks.map(([orderRef, name, email, qty, unitPrice, status, d]) => ({ orderRef, name, email, country: "MY", address: "Kuala Lumpur", sku: "KC-CLASSIC-EN", qty, unitPrice, status, orderDate: daysAgo(d as number) })) });
  onStep("Importing Shopee orders");
  await call("importOrders", { source: "shopee", location: "shopee_fbs", rows: [
    { orderRef: "2611190ABCD", name: "Farah Aziz", email: "farah@mail.demo", sku: "KC-CLASSIC-EN", qty: "1", unitPrice: "69", status: "shipped", orderDate: daysAgo(6) },
    { orderRef: "2611200EFGH", name: "Kevin Ong", email: "", sku: "KC-CLASSIC-EN", qty: "2", unitPrice: "69", status: "paid", orderDate: daysAgo(3) },
    { orderRef: "2611210JKLM", name: "Mei Ling", email: "meiling@mail.demo", sku: "KC-CLASSIC-EN", qty: "1", unitPrice: "69", status: "paid", orderDate: daysAgo(1) },
  ] });
  onStep("Adding website orders");
  await call("createOrder", { source: "website", sourceRef: "WEB-0007", status: "paid", customer: { name: "Nurul Huda", email: "nurul@mail.demo", country: "MY" }, items: [{ sku: "KC-CLASSIC-MS", qty: 2, unitPrice: 79 }], shippingFee: 8, address: "12 Jalan Bunga, Petaling Jaya" });
  await call("createOrder", { source: "website", sourceRef: "WEB-0008", status: "pending", customer: { name: "Ryan Chua", email: "ryan@mail.demo", country: "SG" }, items: [{ sku: "KC-CLASSIC-EN", qty: 1, unitPrice: 79 }], shippingFee: 15, address: "8 Orchard Rd, Singapore" });

  // ---- a couple of customers already used their code in the (future) app
  onStep("Simulating app sign-ins");
  for (const email of ["aisyah@mail.demo", "daniel.lim@mail.demo"]) {
    const c = store.list("customers").find((x) => x.data.email === email);
    const code = c && store.get(`serialCodes/${c.data.currentCodeId}`)?.code;
    if (code) await invoke("redeemSerialCode", { code, device: email.startsWith("a") ? "iPhone 15 · iOS 26" : "Pixel 9 · Android 16" }, null);
  }

  // ---- corporate
  onStep("Setting up corporate clients");
  const acme = newId(), velvet = newId(), hotel = newId();
  commit([
    { op: "set", path: `corporates/${acme}`, data: { company: "Acme Digital Sdn Bhd", segment: "corporate", stage: "lead", regNo: "201901023456", taxId: "C2584563200", address: "Acme Tower, 1 Jalan Sentral, 50470 Kuala Lumpur", billingEmail: "ap@acme.demo", website: "acme.demo", notes: "Annual dinner in December, ~400 guests.", nextFollowUpAt: null, contacts: [{ name: "Siti Hamid", email: "siti@acme.demo", phone: "+60 12-345 6789", role: "Marketing Manager" }], createdAt: Timestamp.now(), updatedAt: Timestamp.now() } },
    { op: "set", path: `corporates/${velvet}`, data: { company: "Velvet Lounge KL", segment: "club", stage: "lead", regNo: "", taxId: "", address: "Changkat Bukit Bintang, KL", billingEmail: "owner@velvet.demo", website: "", notes: "Wants branded decks for VIP tables.", nextFollowUpAt: Timestamp.fromMillis(Date.now() - 86400_000), contacts: [{ name: "Ben Teo", email: "ben@velvet.demo", phone: "+60 16-222 3333", role: "Owner" }], createdAt: Timestamp.now(), updatedAt: Timestamp.now() } },
    { op: "set", path: `corporates/${hotel}`, data: { company: "Grand Harbour Hotel", segment: "events", stage: "negotiating", regNo: "", taxId: "", address: "Penang", billingEmail: "events@grandharbour.demo", website: "", notes: "", nextFollowUpAt: Timestamp.fromMillis(Date.now() + 5 * 86400_000), contacts: [{ name: "Lee Mun", email: "lee@grandharbour.demo", phone: "", role: "Events" }], createdAt: Timestamp.now(), updatedAt: Timestamp.now() } },
  ]);
  await call("recordSample", { corporateId: acme, sampleType: "generic_logo", qty: 2, sku: "KC-SAMPLE-LOGO", followUpAt: daysAgo(-3), notes: "Generic deck with Acme logo mock-up. Offered RM 28/deck for 400+." });
  await call("recordSample", { corporateId: velvet, sampleType: "standard", qty: 1, sku: "KC-CLASSIC-EN", followUpAt: daysAgo(1), notes: "Left a deck at the bar." });

  onStep("Creating a corporate order with a proof");
  const coId = newId();
  commit([{ op: "set", path: `corporateOrders/${coId}`, data: {
    corporateId: acme, corporateName: "Acme Digital Sdn Bhd", title: "Acme Annual Dinner 2026 deck", qty: 400, unitPrice: 28, currency: "MYR",
    deckId, sku: null, designFiles: [], stage: "quote", notes: "Logo on card back, Acme purple.", shipping: { address: "Acme Tower, KL", courier: "", trackingNo: "" },
    timeline: [{ stage: "quote", at: Timestamp.now(), by: DEMO_USERS[2].email, note: "Created" }], createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  } }]);
  const salesUid = Object.values(users).find((u) => u.email === "sales@demo.test")!.uid;
  await invoke("updateCorporateOrderStage", { corporateOrderId: coId, stage: "design", note: "Logo received" }, salesUid);
  await invoke("updateCorporateOrderStage", { corporateOrderId: coId, stage: "proof", note: "Proof sent to Siti" }, salesUid);
  const proofPath = `corporates/${acme}/proofs/${coId}/acme-proof.png`;
  await files.put(proofPath, await cardPng("ACME", "♛", "#5a189a"), "image/png");
  commit([{ op: "update", path: `corporateOrders/${coId}`, data: { proof: { name: "acme-proof.png", path: proofPath, status: "pending", uploadedAt: new Date().toISOString() } } }]);

  const invId = newId();
  commit([{ op: "set", path: `invoices/${invId}`, data: {
    corporateId: acme, corporateOrderId: coId, type: "quote", status: "draft", currency: "MYR",
    lineItems: [{ description: "Acme Annual Dinner 2026 deck — 400 custom printed decks", qty: 400, unitPrice: 28 }, { description: "Custom card-back design", qty: 1, unitPrice: 500 }],
    taxRate: 8, taxLabel: "SST", issueDate: Timestamp.now(), dueDate: Timestamp.fromMillis(Date.now() + 14 * 86400_000), notes: "Quote valid for 14 days. 50% deposit to start production.", createdAt: Timestamp.now(),
  } }]);
  await invoke("issueInvoice", { invoiceId: invId }, salesUid);

  commit([{ op: "set", path: "_demo/meta", data: { seededAt: Timestamp.now() } }]);
  onStep("Done");
}
