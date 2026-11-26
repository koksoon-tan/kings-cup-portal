/**
 * End-to-end test against the local emulators. Exercises functions + security rules
 * exactly as the admin dashboard (and future mobile app) would.
 *
 *   firebase emulators:start --project demo-kingscup     (in another terminal)
 *   node tests/emulator-e2e.mjs
 */
import { createRequire } from "module";
import assert from "assert/strict";
const adminReq = createRequire(new URL("../admin/package.json", import.meta.url));
const fnReq = createRequire(new URL("../functions/package.json", import.meta.url));

const { initializeApp, deleteApp } = adminReq("firebase/app");
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signInWithCustomToken, signOut } = adminReq("firebase/auth");
const fs = adminReq("firebase/firestore");
const { getStorage, connectStorageEmulator, ref, uploadBytes, getBytes } = adminReq("firebase/storage");
const { getFunctions, connectFunctionsEmulator, httpsCallable } = adminReq("firebase/functions");
const JSZip = fnReq("jszip");
const sharp = fnReq("sharp");

process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const adminApp = fnReq("firebase-admin/app");
const aApp = adminApp.initializeApp({ projectId: "demo-kingscup" }, "e2e-admin");
const aDb = fnReq("firebase-admin/firestore").getFirestore(aApp);
const aAuth = fnReq("firebase-admin/auth").getAuth(aApp);

const PROJECT = "demo-kingscup";
let n = 0;
function client(name) {
  const app = initializeApp({ apiKey: "demo", projectId: PROJECT, storageBucket: `${PROJECT}.appspot.com`, authDomain: `${PROJECT}.firebaseapp.com` }, name);
  const auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = fs.getFirestore(app); fs.connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const st = getStorage(app); connectStorageEmulator(st, "127.0.0.1", 9199);
  const fn = getFunctions(app, "asia-southeast1"); connectFunctionsEmulator(fn, "127.0.0.1", 5001);
  const call = async (name, data) => (await httpsCallable(fn, name, { timeout: 300000 })(data)).data;
  return { app, auth, db, st, call };
}
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);
async function rejects(p, re, msg) {
  try { await p; } catch (e) { if (re && !re.test(e.message)) throw new Error(`${msg}: unexpected error ${e.message}`); return ok(msg); }
  throw new Error(`${msg}: expected failure`);
}
const wait = async (fn, label, ms = 60000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 500)); }
  throw new Error(`Timed out waiting for ${label}`);
};
const inv = async (sku) => (await aDb.doc(`inventory/${sku}`).get()).data();

// Fresh data each run
const RUN = Date.now().toString(36).toUpperCase();
const SKU = `KC-TEST-${RUN}`;
const email = (x) => `${x}.${RUN.toLowerCase()}@example.com`;

console.log("Kings Cup admin — emulator end-to-end test\n");

// ---------------------------------------------------------------- staff
const sa = client("superadmin");
await signInWithEmailAndPassword(sa.auth, "admin@example.com", "password123!");
await sa.auth.currentUser.getIdToken(true);
ok("superadmin signs in");
await sa.call("createStaff", { email: email("ops"), password: "password123!", role: "ops", displayName: "Ops" });
await sa.call("createStaff", { email: email("sales"), password: "password123!", role: "sales", displayName: "Sales" });
ok("superadmin creates ops + sales staff");
const ops = client("ops"); await signInWithEmailAndPassword(ops.auth, email("ops"), "password123!");
const sales = client("sales"); await signInWithEmailAndPassword(sales.auth, email("sales"), "password123!");
await rejects(ops.call("createStaff", { email: email("x"), password: "password123!", role: "admin" }), /cannot manage staff/, "ops cannot create staff");

// ---------------------------------------------------------------- settings + inventory
await fs.setDoc(fs.doc(sa.db, "settings/general"), {
  currency: "MYR", autoIssueCodeOnPaid: true, codeExpiryDays: 30, defaultLocation: "main",
  locations: [{ id: "main", name: "Main warehouse" }, { id: "shopee_fbs", name: "Fulfilled by Shopee" }],
});
await fs.setDoc(fs.doc(sa.db, "settings/company"), { name: "Kings Cup Sdn Bhd", address: "1 Jalan Test, KL", regNo: "202601000001", taxId: "W10-0000", bankDetails: "Maybank 1234567890", email: "billing@kingscup.test", taxRate: 8, taxLabel: "SST" });
ok("settings saved (2 locations, company details)");
await fs.setDoc(fs.doc(ops.db, `inventory/${SKU}`), { name: "Classic deck (EN)", kind: "retail", lowStockThreshold: 10, allocation: {}, onHand: 0, reserved: 0, active: true });
ok("ops creates SKU via client (rules allow zero-stock create)");
await rejects(fs.updateDoc(fs.doc(ops.db, `inventory/${SKU}`), { onHand: 999 }), /permission|false for/i, "rules block editing stock counts directly");
await ops.call("adjustStock", { sku: SKU, type: "stock_in", qty: 100, location: "main", unitCost: 5, poNumber: "PO-1" });
await ops.call("adjustStock", { sku: SKU, type: "stock_in", qty: 100, location: "main", unitCost: 7, poNumber: "PO-2" });
let i = await inv(SKU);
assert.equal(i.onHand, 200); assert.equal(i.byLocation.main, 200); assert.equal(i.unitCost, 6);
ok("stock in 2×100 → onHand 200, weighted unit cost 6.00");
await ops.call("adjustStock", { sku: SKU, type: "transfer", qty: 30, location: "main", toLocation: "shopee_fbs" });
i = await inv(SKU); assert.equal(i.byLocation.main, 170); assert.equal(i.byLocation.shopee_fbs, 30); assert.equal(i.onHand, 200);
ok("transfer 30 to Shopee FBS (onHand unchanged)");
await ops.call("adjustStock", { sku: SKU, type: "damage", qty: 5, location: "main", note: "water damage" });
i = await inv(SKU); assert.equal(i.onHand, 195);
ok("damaged 5 → onHand 195");
await rejects(ops.call("adjustStock", { sku: SKU, type: "damage", qty: 31, location: "shopee_fbs" }), /only 30/, "can't remove more than a location holds");

// ---------------------------------------------------------------- orders + codes
const o1 = await ops.call("createOrder", {
  source: "website", sourceRef: "WEB-1", status: "paid", customer: { name: "Jane Tan", email: email("jane") },
  items: [{ sku: SKU, qty: 2, unitPrice: 79 }], shippingFee: 10,
});
i = await inv(SKU); assert.equal(i.reserved, 2); assert.equal(i.onHand, 195);
const order1 = (await aDb.doc(`orders/${o1.orderId}`).get()).data();
assert.equal(order1.total, 168); assert.match(order1.orderNo, /^ORD-\d{6}$/);
ok(`paid order ${order1.orderNo} reserves 2 units, total 168.00`);
let cust = (await aDb.doc(`customers/${o1.customerId}`).get()).data();
assert.equal(cust.codeStatus, "sent"); assert.equal(cust.source, "website");
const codeDoc = (await aDb.doc(`serialCodes/${cust.currentCodeId}`).get()).data();
assert.match(codeDoc.code, /^KC-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
assert.equal(codeDoc.emailStatus, "queued"); assert.ok(codeDoc.expiresAt);
const mail = (await aDb.doc(`mail/${codeDoc.mailId}`).get()).data();
assert.equal(mail.to, email("jane")); assert.ok(mail.message.html.includes(codeDoc.code)); assert.ok(mail.message.html.includes("Jane Tan"));
ok(`customer auto-created, code ${codeDoc.code.slice(0, 3)}…${codeDoc.last4} issued & email queued`);

await aDb.doc(`mail/${codeDoc.mailId}`).update({ delivery: { state: "SUCCESS" } });
await wait(async () => (await aDb.doc(`serialCodes/${cust.currentCodeId}`).get()).data().emailStatus === "delivered", "delivered");
ok("email delivery status mirrored onto the code (delivered)");

await ops.call("updateOrderStatus", { orderId: o1.orderId, status: "shipped", courier: "J&T", trackingNo: "JT123" });
i = await inv(SKU); assert.equal(i.reserved, 0); assert.equal(i.onHand, 193); assert.equal(i.soldByChannel.website, 2);
ok("shipped → reserved 0, onHand 193, website sold 2");
await rejects(ops.call("updateOrderStatus", { orderId: o1.orderId, status: "paid" }), /Can't move/, "invalid status transition blocked");
await ops.call("updateOrderStatus", { orderId: o1.orderId, status: "returned", note: "damaged in transit" });
i = await inv(SKU); assert.equal(i.onHand, 195); assert.equal(i.soldByChannel.website ?? 0, 0);
ok("returned → stock back to 195");

// second order for same email → no second code
await ops.call("createOrder", { source: "website", status: "paid", customer: { name: "Jane Tan", email: email("jane") }, items: [{ sku: SKU, qty: 1 }] });
assert.equal((await aDb.collection("serialCodes").where("customerId", "==", o1.customerId).get()).size, 1);
ok("repeat customer reuses the same customer record and keeps one code");

// ---------------------------------------------------------------- redeem from "mobile app"
const app = client("mobile");
const r = await app.call("redeemSerialCode", { code: codeDoc.code.toLowerCase().replace(/-/g, " "), device: "iPhone 16 / iOS 26" });
assert.equal(r.customerId, o1.customerId);
await signInWithCustomToken(app.auth, r.token);
const own = await fs.getDoc(fs.doc(app.db, `customers/${o1.customerId}`));
assert.equal(own.data().codeStatus, "redeemed");
ok("mobile app redeems code (case/spacing-insensitive) → custom token → reads own customer doc");
const redeemed = (await aDb.doc(`serialCodes/${cust.currentCodeId}`).get()).data();
assert.equal(redeemed.status, "redeemed"); assert.equal(redeemed.redeemedDevice, "iPhone 16 / iOS 26"); assert.ok(redeemed.redeemedAt);
ok("code marked redeemed with time + device");
await rejects(fs.getDocs(fs.collection(app.db, "serialCodes")), /permission|false for/i, "app user cannot list serial codes");
await signOut(app.auth);
await rejects(app.call("redeemSerialCode", { code: codeDoc.code }), /already been used/, "redeemed code cannot be used again");
await rejects(app.call("redeemSerialCode", { code: "KC-AAAA-BBBB-CCCC" }), /Invalid code/, "unknown code rejected");

// ---------------------------------------------------------------- import + allocation
await fs.updateDoc(fs.doc(ops.db, `inventory/${SKU}`), { allocation: { shopee: 3 } });
const rows = [
  { orderRef: `SHP-${RUN}-1`, name: "Ali", email: email("ali"), sku: SKU, qty: "2", unitPrice: "69" },
  { orderRef: `SHP-${RUN}-2`, name: "Mei", email: "", sku: SKU, qty: "2", unitPrice: "69" },
  { orderRef: `SHP-${RUN}-3`, name: "Raj", email: email("raj"), sku: SKU, qty: "1", unitPrice: "69", status: "shipped" },
];
let imp = await ops.call("importOrders", { source: "shopee", rows, location: "shopee_fbs" });
assert.equal(imp.created, 2); assert.equal(imp.errors.length, 1); assert.match(imp.errors[0].error, /allocation for shopee is 3/);
assert.equal(imp.codesIssued, 2);
ok("Shopee import: allocation (limited run = 3) blocks the over-limit order; codes emailed to 2 buyers");
imp = await ops.call("importOrders", { source: "shopee", rows: rows.slice(0, 1), location: "shopee_fbs" });
assert.equal(imp.skipped, 1); assert.equal(imp.created, 0);
ok("re-importing the same order is skipped (dedupe)");
i = await inv(SKU); assert.equal(i.byLocation.shopee_fbs, 29); assert.equal(i.reservedByChannel.shopee, 2);
ok("shipped import deducted from Shopee FBS; paid import reserved");

// ---------------------------------------------------------------- resend / revoke / reissue
const ali = (await aDb.collection("customers").where("email", "==", email("ali")).get()).docs[0];
const aliCode = ali.data().currentCodeId;
await ops.call("resendSerialCode", { codeId: aliCode });
assert.equal((await aDb.doc(`serialCodes/${aliCode}`).get()).data().sendCount, 2);
ok("resend increments send count");
const rv = await ops.call("revokeSerialCode", { codeId: aliCode, reason: "Customer typo'd email", reissue: true });
assert.equal((await aDb.doc(`serialCodes/${aliCode}`).get()).data().status, "revoked");
assert.equal((await aDb.doc(`customers/${ali.id}`).get()).data().currentCodeId, rv.newCodeId);
ok("revoke + reissue → old code revoked, new code active");
await rejects(ops.call("issueSerialCode", { customerId: ali.id }), /already has an active code/, "can't issue a second active code");
await rejects(fs.getDocs(fs.collection(sales.db, "serialCodes")), /permission|false for/i, "sales role cannot read codes");

// ---------------------------------------------------------------- stock take
const st = await ops.call("stockTake", { sku: SKU, counts: { main: 163 } });
assert.deepEqual(st.diffs, { main: -2 });
ok("stock take posts −2 difference at main");
const moves = await aDb.collection("stockMovements").where("sku", "==", SKU).get();
ok(`movement ledger has ${moves.size} entries for the SKU`);

// ---------------------------------------------------------------- decks
await rejects(fs.addDoc(fs.collection(ops.db, "decks"), { name: "x" }), /permission|false for/i, "ops cannot create decks");
const deckRef = await fs.addDoc(fs.collection(sa.db, "decks"), { name: "Classic", type: "inhouse", status: "draft", languages: ["en"], defaultLanguage: "en", upload: { status: "none" }, createdAt: fs.serverTimestamp() });
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const keys = [..."SHDC"].flatMap((s) => RANKS.map((r) => `${r}${s}`)).concat(["JK1", "JK2", "BACK"]);
const png = await sharp({ create: { width: 750, height: 1050, channels: 3, background: "#7b2cbf" } }).png().withMetadata({ density: 300 }).toBuffer();
const zip = new JSZip();
keys.forEach((k, idx) => zip.file(`MyDeck/${idx % 2 ? k.toLowerCase() : k}.png`, png));
zip.file("__MACOSX/._AS.png", "junk");
await uploadBytes(ref(sa.st, `decks/${deckRef.id}/uploads/1.zip`), await zip.generateAsync({ type: "uint8array" }), { contentType: "application/zip" });
const deck = await wait(async () => { const d = (await aDb.doc(`decks/${deckRef.id}`).get()).data(); return ["ready", "error"].includes(d.upload?.status) && d; }, "deck processing", 120000);
assert.equal(deck.upload.status, "ready", JSON.stringify(deck.upload)); assert.equal(Object.keys(deck.cards).length, 55); assert.equal(deck.cardSize, "750x1050");
const preview = await getBytes(ref(sa.st, deck.cards.AS.previewPath));
assert.equal((await sharp(Buffer.from(preview)).metadata()).width, 600);
ok("55-card zip processed: art stored, 600px WebP previews generated");
const bad = new JSZip();
keys.slice(0, 50).forEach((k) => bad.file(`${k}.png`, png));
await uploadBytes(ref(sa.st, `decks/${deckRef.id}/uploads/2.zip`), await bad.generateAsync({ type: "uint8array" }), { contentType: "application/zip" });
const deck2 = await wait(async () => { const d = (await aDb.doc(`decks/${deckRef.id}`).get()).data(); return d.upload?.zipPath?.endsWith("2.zip") && ["ready", "error"].includes(d.upload?.status) && d; }, "bad zip", 120000);
assert.equal(deck2.upload.status, "error"); assert.match(deck2.upload.errors[0], /Missing 5 card\(s\): QC, KC, JK1, JK2, BACK/);
assert.equal(deck2.artVersion, 1);
ok(`incomplete zip rejected with clear error ("${deck2.upload.errors[0].slice(0, 45)}…"), existing art kept`);
await rejects(fs.updateDoc(fs.doc(sa.db, `decks/${deckRef.id}`), { cards: {} }), /permission|false for/i, "card art map can only be written by the processor");

// ---------------------------------------------------------------- corporate
const corpRef = await fs.addDoc(fs.collection(sales.db, "corporates"), { company: `Acme ${RUN}`, segment: "corporate", stage: "lead", address: "Acme Tower, KL", billingEmail: "ap@acme.test", contacts: [] });
await sales.call("recordSample", { corporateId: corpRef.id, sampleType: "generic_logo", qty: 3, sku: SKU, followUpAt: new Date(Date.now() + 7 * 864e5).toISOString(), notes: "Pitched 500 units" });
const corp = (await aDb.doc(`corporates/${corpRef.id}`).get()).data();
assert.equal(corp.samplesSent, 3); assert.equal(corp.stage, "sample_sent");
i = await inv(SKU); assert.equal(i.byLocation.main, 160);
ok("sales records 3 sample decks → stock deducted, stage → sample_sent");
await rejects(fs.addDoc(fs.collection(sales.db, `corporates/${corpRef.id}/samples`), { qty: 1 }), /permission|false for/i, "samples can't bypass inventory");

const co = await fs.addDoc(fs.collection(sales.db, "corporateOrders"), { corporateId: corpRef.id, corporateName: `Acme ${RUN}`, title: "Acme gala deck", qty: 20, unitPrice: 25, currency: "MYR", sku: SKU, stage: "quote", designFiles: [], timeline: [], createdAt: fs.serverTimestamp() });
await rejects(sales.call("updateCorporateOrderStage", { corporateOrderId: co.id, stage: "production" }), /approve the proof/, "production locked until proof approved");
await rejects(fs.updateDoc(co, { proof: { path: "x.pdf", status: "approved" } }), /permission|false for/i, "client can't self-approve proof");
await fs.updateDoc(co, { proof: { name: "proof.pdf", path: `corporates/${corpRef.id}/proofs/x.pdf`, status: "pending" } });
await sales.call("recordProofDecision", { corporateOrderId: co.id, decision: "approved", approvedBy: "Siti (Marketing)", notes: "OK by email" });
await sales.call("updateCorporateOrderStage", { corporateOrderId: co.id, stage: "production" });
await sales.call("updateCorporateOrderStage", { corporateOrderId: co.id, stage: "shipped", deductStock: true, courier: "Lalamove" });
i = await inv(SKU); assert.equal(i.byLocation.main, 140); assert.equal(i.soldByChannel.corporate, 20);
ok("proof approved → production → shipped deducts 20 units (corporate channel)");

const invRef = await fs.addDoc(fs.collection(sales.db, "invoices"), { corporateId: corpRef.id, corporateOrderId: co.id, type: "full", status: "draft", currency: "MYR", lineItems: [{ description: "Custom decks", qty: 20, unitPrice: 25 }], taxRate: 8, taxLabel: "SST", issueDate: fs.Timestamp.now(), createdAt: fs.serverTimestamp() });
await rejects(fs.updateDoc(invRef, { invoiceNo: "INV-FAKE" }), /permission|false for/i, "client can't set invoice numbers");
const issued = await sales.call("issueInvoice", { invoiceId: invRef.id });
assert.match(issued.invoiceNo, /^INV-\d{4}-\d{4}$/);
const invDoc = (await aDb.doc(`invoices/${invRef.id}`).get()).data();
assert.equal(invDoc.subtotal, 500); assert.equal(invDoc.tax, 40); assert.equal(invDoc.total, 540);
const pdf = Buffer.from(await getBytes(ref(sales.st, issued.pdfPath)));
assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
ok(`invoice ${issued.invoiceNo} issued: 500 + 8% SST = 540.00, PDF ${Math.round(pdf.length / 1024)} KB`);
await sales.call("markInvoicePaid", { invoiceId: invRef.id, amount: 270, reference: "TT-1" });
assert.equal((await aDb.doc(`invoices/${invRef.id}`).get()).data().status, "partially_paid");
await sales.call("markInvoicePaid", { invoiceId: invRef.id, amount: 270, reference: "TT-2" });
assert.equal((await aDb.doc(`invoices/${invRef.id}`).get()).data().status, "paid");
ok("two part-payments → partially_paid → paid");
const fs_ = await import("fs");
fs_.writeFileSync(new URL("./sample-invoice.pdf", import.meta.url), pdf);

// ---------------------------------------------------------------- player app
await fs.updateDoc(fs.doc(sa.db, `decks/${deckRef.id}`), { status: "published", appAccess: "purchase", effects: { K: "cup" } });
await fs.updateDoc(fs.doc(ops.db, `inventory/${SKU}`), { deckId: deckRef.id, allocation: {} });
const art = (await aDb.doc(`decks/${deckRef.id}`).get()).data().cards.AS;
assert.ok(art.gamePath, "game-sized image path");
assert.equal((await sharp(Buffer.from(await getBytes(ref(sa.st, art.gamePath)))).metadata()).width, 750);
ok("game-sized card images generated (min(900px, art width))");
const playerEmail = email("player");
const po = await ops.call("createOrder", { source: "website", status: "paid", customer: { name: "Pat Player", email: playerEmail }, items: [{ sku: SKU, qty: 1, unitPrice: 79 }] });
let pc = (await aDb.doc(`customers/${po.customerId}`).get()).data();
assert.deepEqual(pc.ownedDeckIds, [deckRef.id]);
ok("paid order adds the SKU's deck to the player's library");
const pl = client("player-app");
const firstCode = (await aDb.doc(`serialCodes/${pc.currentCodeId}`).get()).data().code;
await signInWithCustomToken(pl.auth, (await pl.call("redeemSerialCode", { code: firstCode, device: "test" })).token);
const pub = await fs.getDocs(fs.query(fs.collection(pl.db, "decks"), fs.where("status", "==", "published")));
assert.ok(pub.docs.some((d) => d.id === deckRef.id));
await getBytes(ref(pl.st, art.gamePath));
ok("player can list published decks and download card art");
await rejects(fs.getDoc(fs.doc(pl.db, `customers/${o1.customerId}`)), /permission|false for/i, "player can't read another customer");
await rejects(fs.updateDoc(fs.doc(pl.db, `customers/${po.customerId}`), { ownedDeckIds: ["x"] }), /permission|false for/i, "player can't give themselves decks");
await signOut(pl.auth);
// lost code → new code by email
const before = (await aDb.collection("mail").where("to", "==", playerEmail).get()).size;
await pl.call("requestAccessCode", { email: playerEmail.toUpperCase() });
pc = (await aDb.doc(`customers/${po.customerId}`).get()).data();
const newCode = (await aDb.doc(`serialCodes/${pc.currentCodeId}`).get()).data();
assert.equal(newCode.reason, "self-service"); assert.equal(newCode.status, "sent");
const mails = (await aDb.collection("mail").where("to", "==", playerEmail).get()).docs.map((d) => d.data());
assert.equal(mails.length, before + 1); assert.ok(mails.some((m) => /new/i.test(m.message.subject) && m.message.html.includes(newCode.code)));
ok("lost-code request emails a fresh one-time code");
const again = await pl.call("redeemSerialCode", { code: newCode.code, device: "new phone" });
await signInWithCustomToken(pl.auth, again.token);
assert.equal(pl.auth.currentUser.uid, `cust_${po.customerId}`);
ok("new code signs into the same player account (decks follow them)");
await signOut(pl.auth);
const unknown = await pl.call("requestAccessCode", { email: email("nobody") });
assert.deepEqual(unknown, { ok: true });
ok("unknown email gets the same answer (no customer lookup leak)");
await pl.call("requestAccessCode", { email: playerEmail }); await pl.call("requestAccessCode", { email: playerEmail });
await rejects(pl.call("requestAccessCode", { email: playerEmail }), /Too many/, "lost-code requests are rate-limited per email");
// block
const spare = (await aDb.doc(`customers/${po.customerId}`).get()).data().currentCodeId;
await fs.updateDoc(fs.doc(sa.db, `customers/${po.customerId}`), { banned: true });
await wait(async () => (await aAuth.getUser(`cust_${po.customerId}`)).disabled, "player disabled");
await rejects(pl.call("redeemSerialCode", { code: (await aDb.doc(`serialCodes/${spare}`).get()).data().code }), /blocked/, "blocked player can't sign in, account disabled");

// ---------------------------------------------------------------- audit + role removal
const audits = await aDb.collection("auditLogs").get();
ok(`${audits.size} audit log entries written`);
const opsUser = await aAuth.getUserByEmail(email("ops"));
await sa.call("setStaffRole", { uid: opsUser.uid, role: null });
assert.equal((await aAuth.getUser(opsUser.uid)).disabled, true);
ok("superadmin removes ops access (account disabled, tokens revoked)");

for (const c of [sa, ops, sales, app, pl]) await deleteApp(c.app);
console.log(`\nAll ${n} checks passed.`);
process.exit(0);
