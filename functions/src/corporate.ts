import { onCall } from "firebase-functions/v2/https";
import PDFDocument from "pdfkit";
import {
  db, storage, FieldValue, Timestamp, HttpsError, REGION, audit, requireArea, str, int, num,
  nextCounter, getGeneralSettings,
} from "./common";
import { readInventory, removeStock, commitInventory } from "./inventory";

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

export const SAMPLE_TYPES = ["generic_logo", "standard", "custom_mockup", "other"];

/** recordSample({ corporateId, sampleType, qty, sku?, location?, followUpAt?, notes? }) */
export const recordSample = onCall({ region: REGION }, async (req) => {
  const actor = requireArea(req, "samples");
  const d = req.data ?? {};
  const corporateId = str(d.corporateId, "corporateId", { required: true });
  const sampleType = str(d.sampleType, "sampleType", { required: true });
  if (!SAMPLE_TYPES.includes(sampleType)) throw new HttpsError("invalid-argument", "Unknown sample type.");
  const qty = int(d.qty, "qty", { min: 1, max: 10000 });
  const sku = str(d.sku, "sku");
  const settings = await getGeneralSettings();
  const location = str(d.location, "location") || settings.defaultLocation;
  const notes = str(d.notes, "notes", { max: 1000 });
  const followUpAt = d.followUpAt ? Timestamp.fromDate(new Date(d.followUpAt)) : null;

  const corpRef = db.collection("corporates").doc(corporateId);
  const sampleRef = corpRef.collection("samples").doc();
  await db.runTransaction(async (tx) => {
    const corp = await tx.get(corpRef);
    if (!corp.exists) throw new HttpsError("not-found", "Corporate not found.");
    const inv = sku ? await readInventory(tx, [sku]) : new Map();
    if (sku) {
      removeStock(tx, inv.get(sku)!, qty, "sample",
        { actor, location, corporateId, sampleId: sampleRef.id, note: `Sample for ${corp.data()!.company}` });
      commitInventory(tx, inv);
    }
    tx.set(sampleRef, {
      corporateId, sampleType, qty, sku: sku || null, location: sku ? location : null,
      sentAt: FieldValue.serverTimestamp(), followUpAt, outcome: "pending", notes,
      by: { uid: actor.uid, email: actor.email },
    });
    const patch: Record<string, unknown> = {
      samplesSent: FieldValue.increment(qty),
      lastSampleAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (followUpAt) patch.nextFollowUpAt = followUpAt;
    if (["lead", undefined].includes(corp.data()!.stage)) patch.stage = "sample_sent";
    tx.update(corpRef, patch);
    audit(actor, "sample.record", "corporates", corporateId, { sampleType, qty, sku }, tx);
  });
  return { sampleId: sampleRef.id };
});

// ---------------------------------------------------------------------------
// Corporate orders (bulk / custom print jobs)
// ---------------------------------------------------------------------------

export const CORP_STAGES = [
  "quote", "design", "proof", "deposit", "production", "ready", "shipped", "completed", "cancelled",
] as const;
type Stage = (typeof CORP_STAGES)[number];

/** updateCorporateOrderStage({ corporateOrderId, stage, note?, deductStock?, location?, courier?, trackingNo? }) */
export const updateCorporateOrderStage = onCall({ region: REGION }, async (req) => {
  const actor = requireArea(req, "corporates");
  const d = req.data ?? {};
  const id = str(d.corporateOrderId, "corporateOrderId", { required: true });
  const stage = str(d.stage, "stage", { required: true }) as Stage;
  if (!CORP_STAGES.includes(stage)) throw new HttpsError("invalid-argument", "Unknown stage.");
  const note = str(d.note, "note", { max: 500 });
  const settings = await getGeneralSettings();
  const location = str(d.location, "location") || settings.defaultLocation;

  await db.runTransaction(async (tx) => {
    const ref = db.collection("corporateOrders").doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Corporate order not found.");
    const o = snap.data()!;
    const toIdx = CORP_STAGES.indexOf(stage);
    if (["completed", "cancelled"].includes(o.stage)) {
      throw new HttpsError("failed-precondition", `Order is already ${o.stage}.`);
    }
    if (toIdx >= CORP_STAGES.indexOf("production") && stage !== "cancelled" && o.proof?.status !== "approved") {
      throw new HttpsError("failed-precondition", "The client must approve the proof before production.");
    }
    const deduct = stage === "shipped" && d.deductStock === true && o.sku && !o.stockDeducted;
    const inv = deduct ? await readInventory(tx, [o.sku]) : new Map();
    if (deduct) {
      removeStock(tx, inv.get(o.sku)!, o.qty, "sale",
        { actor, location, channel: "corporate", corporateId: o.corporateId, note: `Corporate order ${o.title}` });
      commitInventory(tx, inv);
    }
    const patch: Record<string, unknown> = {
      stage,
      updatedAt: FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion({ stage, at: Timestamp.now(), by: actor.email, note }),
    };
    if (deduct) patch.stockDeducted = true;
    if (d.courier) patch["shipping.courier"] = str(d.courier, "courier", { max: 100 });
    if (d.trackingNo) patch["shipping.trackingNo"] = str(d.trackingNo, "trackingNo", { max: 100 });
    tx.update(ref, patch);
    if (stage === "completed" || stage === "production") {
      tx.update(db.collection("corporates").doc(o.corporateId), {
        stage: stage === "completed" ? "customer" : "won", updatedAt: FieldValue.serverTimestamp(),
      });
    }
    audit(actor, "corporateOrder.stage", "corporateOrders", id, { from: o.stage, to: stage, note, deducted: !!deduct }, tx);
  });
  return { ok: true };
});

/** recordProofDecision({ corporateOrderId, decision: 'approved'|'rejected', approvedBy, notes? }) */
export const recordProofDecision = onCall({ region: REGION }, async (req) => {
  const actor = requireArea(req, "corporates");
  const id = str(req.data?.corporateOrderId, "corporateOrderId", { required: true });
  const decision = str(req.data?.decision, "decision", { required: true });
  if (!["approved", "rejected"].includes(decision)) throw new HttpsError("invalid-argument", "decision must be approved or rejected.");
  const approvedBy = str(req.data?.approvedBy, "approvedBy", { required: true, max: 200 });
  const notes = str(req.data?.notes, "notes", { max: 1000 });
  const ref = db.collection("corporateOrders").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Corporate order not found.");
  if (!snap.data()!.proof?.path) throw new HttpsError("failed-precondition", "Upload a proof file first.");
  await ref.update({
    "proof.status": decision,
    "proof.decidedBy": approvedBy,
    "proof.decidedAt": FieldValue.serverTimestamp(),
    "proof.notes": notes,
    "proof.recordedBy": actor.email,
    updatedAt: FieldValue.serverTimestamp(),
    timeline: FieldValue.arrayUnion({ stage: `proof_${decision}`, at: Timestamp.now(), by: actor.email, note: `${approvedBy}: ${notes}` }),
  });
  await audit(actor, `proof.${decision}`, "corporateOrders", id, { approvedBy, notes });
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Invoices & quotes
// ---------------------------------------------------------------------------

interface LineItem { description: string; qty: number; unitPrice: number }

function money(n: number, cur: string) {
  return `${cur} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function renderInvoicePdf(inv: any, company: any, corp: any): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  const cur = inv.currency;
  const title = inv.type === "quote" ? "QUOTATION" : "INVOICE";

  doc.fontSize(18).font("Helvetica-Bold").text(company.name || "Your Company", 50, 50);
  doc.fontSize(9).font("Helvetica").fillColor("#444");
  [company.regNo && `Reg. No: ${company.regNo}`, company.address, company.email, company.phone,
    company.taxId && `Tax ID: ${company.taxId}`].filter(Boolean).forEach((l) => doc.text(l));

  doc.fillColor("#000").fontSize(20).font("Helvetica-Bold").text(title, 350, 50, { width: 195, align: "right" });
  doc.fontSize(10).font("Helvetica");
  const meta: [string, string][] = [
    ["No.", inv.invoiceNo],
    ["Date", inv.issueDate.toDate().toISOString().slice(0, 10)],
  ];
  if (inv.dueDate) meta.push([inv.type === "quote" ? "Valid until" : "Due", inv.dueDate.toDate().toISOString().slice(0, 10)]);
  if (inv.type === "deposit") meta.push(["Type", "Deposit"]);
  if (inv.type === "balance") meta.push(["Type", "Balance"]);
  let y = 80;
  meta.forEach(([k, v]) => { doc.text(`${k}: ${v}`, 350, y, { width: 195, align: "right" }); y += 14; });

  y = Math.max(doc.y, y) + 25;
  doc.font("Helvetica-Bold").text("Bill to", 50, y);
  doc.font("Helvetica").text(corp.company ?? "", 50, y + 14);
  [corp.address, corp.billingEmail, corp.taxId && `Tax ID: ${corp.taxId}`].filter(Boolean).forEach((l) => doc.text(l));

  y = doc.y + 25;
  const cols = { desc: 50, qty: 330, price: 380, amt: 465 };
  doc.rect(50, y - 4, 495, 18).fill("#eeeeee").fillColor("#000").font("Helvetica-Bold");
  doc.text("Description", cols.desc + 4, y).text("Qty", cols.qty, y, { width: 40, align: "right" })
    .text("Unit price", cols.price, y, { width: 75, align: "right" }).text("Amount", cols.amt, y, { width: 76, align: "right" });
  y += 22;
  doc.font("Helvetica");
  (inv.lineItems as LineItem[]).forEach((li) => {
    const h = doc.heightOfString(li.description, { width: 270 });
    if (y + h > 720) { doc.addPage(); y = 50; }
    doc.text(li.description, cols.desc + 4, y, { width: 270 })
      .text(String(li.qty), cols.qty, y, { width: 40, align: "right" })
      .text(money(li.unitPrice, ""), cols.price, y, { width: 75, align: "right" })
      .text(money(li.qty * li.unitPrice, ""), cols.amt, y, { width: 76, align: "right" });
    y += Math.max(h, 12) + 8;
  });
  doc.moveTo(50, y).lineTo(545, y).strokeColor("#cccccc").stroke();
  y += 10;
  const totals: [string, string][] = [["Subtotal", money(inv.subtotal, cur)]];
  if (inv.taxRate) totals.push([`${inv.taxLabel || "Tax"} (${inv.taxRate}%)`, money(inv.tax, cur)]);
  totals.push(["Total", money(inv.total, cur)]);
  totals.forEach(([k, v], i) => {
    doc.font(i === totals.length - 1 ? "Helvetica-Bold" : "Helvetica")
      .text(k, 330, y, { width: 125, align: "right" }).text(v, 465, y, { width: 76, align: "right" });
    y += 16;
  });

  y += 20;
  if (inv.notes) { doc.font("Helvetica-Bold").text("Notes", 50, y); doc.font("Helvetica").text(inv.notes, 50, doc.y, { width: 495 }); y = doc.y + 12; }
  if (inv.type !== "quote" && company.bankDetails) {
    doc.font("Helvetica-Bold").text("Payment details", 50, y);
    doc.font("Helvetica").text(company.bankDetails, 50, doc.y, { width: 495 });
  }
  if (company.invoiceFooter) doc.fontSize(8).fillColor("#666").text(company.invoiceFooter, 50, 770, { width: 495, align: "center" });
  doc.end();
  return done;
}

/**
 * issueInvoice({ invoiceId }) – assigns the number (INV-2026-0001 / QUO-2026-0001), locks totals,
 * renders the PDF to Storage (invoices/{id}.pdf) and sets status "issued".
 */
export const issueInvoice = onCall({ region: REGION }, async (req) => {
  const actor = requireArea(req, "invoices");
  const invoiceId = str(req.data?.invoiceId, "invoiceId", { required: true });
  const ref = db.collection("invoices").doc(invoiceId);

  const issued = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Invoice not found.");
    const inv = snap.data()!;
    if (inv.status !== "draft") throw new HttpsError("failed-precondition", `Invoice is already ${inv.status}.`);
    const items = (inv.lineItems ?? []) as LineItem[];
    if (!items.length) throw new HttpsError("failed-precondition", "Add at least one line item.");
    items.forEach((li, i) => {
      str(li.description, `line ${i + 1} description`, { required: true });
      num(li.qty, `line ${i + 1} qty`, { min: 0 });
      num(li.unitPrice, `line ${i + 1} unit price`);
    });
    const year = new Date().getFullYear();
    const prefix = inv.type === "quote" ? "QUO" : "INV";
    const n = await nextCounter(`${prefix.toLowerCase()}-${year}`, tx);
    const subtotal = Math.round(items.reduce((s, li) => s + li.qty * li.unitPrice, 0) * 100) / 100;
    const taxRate = Number(inv.taxRate) || 0;
    const tax = Math.round(subtotal * taxRate) / 100;
    const patch = {
      invoiceNo: `${prefix}-${year}-${String(n).padStart(4, "0")}`,
      subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100,
      status: "issued",
      issueDate: inv.issueDate ?? Timestamp.now(),
      issuedAt: FieldValue.serverTimestamp(),
      issuedBy: actor.email,
    };
    tx.update(ref, patch);
    audit(actor, "invoice.issue", "invoices", invoiceId, { invoiceNo: patch.invoiceNo, total: patch.total }, tx);
    return { ...inv, ...patch } as Record<string, any>;
  });

  const [company, corp] = await Promise.all([
    db.collection("settings").doc("company").get(),
    db.collection("corporates").doc(issued.corporateId).get(),
  ]);
  const pdf = await renderInvoicePdf(issued, company.data() ?? {}, corp.data() ?? {});
  const path = `invoices/${invoiceId}.pdf`;
  await storage.bucket().file(path).save(pdf, { contentType: "application/pdf" });
  await ref.update({ pdfPath: path });
  return { invoiceNo: issued.invoiceNo, pdfPath: path };
});

/** markInvoicePaid({ invoiceId, amount, reference?, paidAt? }) */
export const markInvoicePaid = onCall({ region: REGION }, async (req) => {
  const actor = requireArea(req, "invoices");
  const invoiceId = str(req.data?.invoiceId, "invoiceId", { required: true });
  const amount = num(req.data?.amount, "amount", { min: 0 });
  const reference = str(req.data?.reference, "reference", { max: 200 });
  const paidAt = req.data?.paidAt ? Timestamp.fromDate(new Date(req.data.paidAt)) : Timestamp.now();
  await db.runTransaction(async (tx) => {
    const ref = db.collection("invoices").doc(invoiceId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Invoice not found.");
    const inv = snap.data()!;
    if (inv.status !== "issued" && inv.status !== "partially_paid") {
      throw new HttpsError("failed-precondition", `Invoice is ${inv.status}.`);
    }
    if (inv.type === "quote") throw new HttpsError("failed-precondition", "Quotes can't be paid – issue an invoice.");
    const paid = Math.round(((inv.amountPaid ?? 0) + amount) * 100) / 100;
    tx.update(ref, {
      amountPaid: paid,
      status: paid >= inv.total ? "paid" : "partially_paid",
      paidAt: paid >= inv.total ? paidAt : null,
      payments: FieldValue.arrayUnion({ amount, reference, at: paidAt, by: actor.email }),
    });
    audit(actor, "invoice.payment", "invoices", invoiceId, { amount, reference }, tx);
  });
  return { ok: true };
});

/** voidInvoice({ invoiceId, reason }) */
export const voidInvoice = onCall({ region: REGION }, async (req) => {
  const actor = requireArea(req, "invoices");
  const invoiceId = str(req.data?.invoiceId, "invoiceId", { required: true });
  const reason = str(req.data?.reason, "reason", { required: true, max: 300 });
  const ref = db.collection("invoices").doc(invoiceId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Invoice not found.");
  if (snap.data()!.status === "paid") throw new HttpsError("failed-precondition", "Paid invoices can't be voided – issue a credit note.");
  await ref.update({ status: "void", voidReason: reason, voidedAt: FieldValue.serverTimestamp() });
  await audit(actor, "invoice.void", "invoices", invoiceId, { reason });
  return { ok: true };
});
