// Builds a realistic demo dataset by calling the real function handlers.
import { circusDeckZip, CIRCUS_ACTIONS } from "./seedArt";
import { users, commit, store, files, Timestamp, saveUsers, newId } from "./core";
import { invoke } from "./client-functions";

export const DEMO_PASSWORD = "kingscup2026";
export const DEMO_USERS = [
  { email: "admin@demo.test", role: "superadmin", name: "Alex (Owner)" },
  { email: "ops@demo.test", role: "ops", name: "Olivia (Operations)" },
  { email: "sales@demo.test", role: "sales", name: "Sam (Sales)" },
];

/** Bump when the sample data changes shape, so browsers holding older demo data rebuild it. */
export const SEED_VERSION = 2;
export const isSeeded = () => store.get("_demo/meta")?.version === SEED_VERSION;
export const needsReset = () => store.has("_demo/meta") && !isSeeded();

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
  onStep("Drawing the circus deck");
  const deckId = newId();
  const actions = Object.fromEntries(Object.entries(CIRCUS_ACTIONS).map(([k, v]) => [k, { en: { title: v.en[0], text: v.en[1] }, ms: { title: v.ms[0], text: v.ms[1] } }]));
  // Action text and player-app effects are global (Action text page), shared by every deck.
  commit([{ op: "set", path: "settings/actions", data: { actions, effects: { J: "rule", 8: "mate", Q: "master", K: "cup" } } }]);
  commit([{ op: "set", path: `decks/${deckId}`, data: {
    name: "Kings Cup Circus", code: "CIRCUS-01", type: "inhouse", corporateId: null, designer: null, status: "published",
    languages: ["en", "ms"], defaultLanguage: "en", countries: ["MY", "SG"], appAccess: "purchase", appPrice: 0, expiryDate: null,
    description: "Our launch deck: step right up to the big top.", cardOverrides: {},
    textStyle: { fontId: null, fontFamily: "Barlow Condensed", color: "#fbf1dc",
      sizePct: 4.2, align: "left", vAlign: "top", bold: true, uppercase: false, strokeColor: "#8e0b22", strokeWidth: 0, showTitle: true,
      title: { fontId: null, fontFamily: "Rye", color: "#f2b632", sizePct: 5.2, bold: false },
      box: { x: 12.5, y: 67.3, w: 60, h: 23.8 } },
    upload: { status: "uploading", errors: [], warnings: [] }, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  } }]);
  const zip = await circusDeckZip();
  onStep("Processing card art (validating + previews)");
  await files.put(`decks/${deckId}/uploads/seed.zip`, zip, "application/zip");
  await files.finalize(`decks/${deckId}/uploads/seed.zip`);

  commit([{ op: "set", path: `decks/${newId()}`, data: {
    name: "Halloween Night", code: "HALLOWEEN-01", type: "inhouse", corporateId: null, designer: null, status: "published",
    languages: ["en"], defaultLanguage: "en", countries: ["MY"], appAccess: "purchase", appPrice: 0, expiryDate: null,
    description: "A limited-edition deck of spooky circus cards.", cardOverrides: {},
    textStyle: { fontId: null, fontFamily: "Arial", color: "#111111", sizePct: 5.5, align: "center", vAlign: "middle", bold: true, uppercase: false, strokeColor: "#ffffff", strokeWidth: 0, showTitle: true, box: { x: 12, y: 62, w: 76, h: 26 } },
    upload: { status: "none", errors: [], warnings: [] }, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  } }]);

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
  sku("KC-CLASSIC-EN", "Kings Cup Circus (English)", "retail", 50, { shopee: 150, lazada: 100 });
  sku("KC-CLASSIC-MS", "Kings Cup Circus (Bahasa)", "retail", 30);
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
  const proofPath = `corporates/${acme}/proofs/${coId}/acme-proof.webp`;
  await files.put(proofPath, await (await fetch((await import("./art/AS.webp?inline")).default)).blob(), "image/webp");
  commit([{ op: "update", path: `corporateOrders/${coId}`, data: { proof: { name: "acme-proof.webp", path: proofPath, status: "pending", uploadedAt: new Date().toISOString() } } }]);

  const invId = newId();
  commit([{ op: "set", path: `invoices/${invId}`, data: {
    corporateId: acme, corporateOrderId: coId, type: "quote", status: "draft", currency: "MYR",
    lineItems: [{ description: "Acme Annual Dinner 2026 deck — 400 custom printed decks", qty: 400, unitPrice: 28 }, { description: "Custom card-back design", qty: 1, unitPrice: 500 }],
    taxRate: 8, taxLabel: "SST", issueDate: Timestamp.now(), dueDate: Timestamp.fromMillis(Date.now() + 14 * 86400_000), notes: "Quote valid for 14 days. 50% deposit to start production.", createdAt: Timestamp.now(),
  } }]);
  await invoke("issueInvoice", { invoiceId: invId }, salesUid);

  commit([{ op: "set", path: "_demo/meta", data: { seededAt: Timestamp.now(), version: SEED_VERSION } }]);
  onStep("Done");
}
