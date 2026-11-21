import { onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import {
  db, FieldValue, Timestamp, HttpsError, REGION, Actor, audit, requireArea, str, int, num, normEmail,
  nextCounter, source as parseSource, Source, getGeneralSettings,
} from "./common";
import { readInventory, reserve, release, removeStock, addStock, commitInventory } from "./inventory";
import { issueCode } from "./codes";
import type { Transaction, DocumentReference } from "firebase-admin/firestore";

export const STATUSES = [
  "pending", "paid", "packing", "shipped", "delivered", "completed", "cancelled", "refunded", "returned",
] as const;
export type Status = (typeof STATUSES)[number];

const TRANSITIONS: Record<Status, Status[]> = {
  pending: ["paid", "cancelled"],
  paid: ["packing", "shipped", "cancelled", "refunded"],
  packing: ["shipped", "cancelled", "refunded"],
  shipped: ["delivered", "returned", "refunded"],
  delivered: ["completed", "returned", "refunded"],
  completed: ["returned", "refunded"],
  cancelled: [],
  refunded: ["returned"],
  returned: ["refunded"],
};

const PAID_LIKE: Status[] = ["paid", "packing", "shipped", "delivered", "completed"];

interface Line { sku: string; name: string; qty: number; unitPrice: number }
interface CustomerInfo { name: string; email: string; phone: string; country: string }

function parseStatus(v: unknown): Status {
  const s = str(v, "status", { required: true }).toLowerCase() as Status;
  if (!STATUSES.includes(s)) throw new HttpsError("invalid-argument", `Unknown status ${s}.`);
  return s;
}

function parseLines(items: unknown): Line[] {
  if (!Array.isArray(items) || !items.length) throw new HttpsError("invalid-argument", "Add at least one item.");
  return items.map((it, i) => ({
    sku: str(it?.sku, `items[${i}].sku`, { required: true }),
    name: str(it?.name, `items[${i}].name`, { max: 200 }),
    qty: int(it?.qty, `items[${i}].qty`, { min: 1 }),
    unitPrice: it?.unitPrice === undefined || it?.unitPrice === "" ? 0 : num(it?.unitPrice, `items[${i}].unitPrice`, { min: 0 }),
  }));
}

function parseCustomer(c: any): CustomerInfo {
  return {
    name: str(c?.name, "customer.name", { max: 200 }),
    email: normEmail(c?.email),
    phone: str(c?.phone, "customer.phone", { max: 50 }),
    country: str(c?.country, "customer.country", { max: 60 }),
  };
}

/** READ phase: locate an existing customer by email. */
async function findCustomer(tx: Transaction, info: CustomerInfo): Promise<DocumentReference | null> {
  if (!info.email) return null;
  const q = await tx.get(db.collection("customers").where("email", "==", info.email).limit(1));
  return q.empty ? null : q.docs[0].ref;
}

/** WRITE phase: create or update the customer for an order. */
function writeCustomer(
  tx: Transaction, existing: DocumentReference | null, info: CustomerInfo, src: Source, sourceRef: string,
  orderId: string, total: number,
): string {
  const ref = existing ?? db.collection("customers").doc();
  const common = {
    sources: FieldValue.arrayUnion(src),
    orderIds: FieldValue.arrayUnion(orderId),
    orderCount: FieldValue.increment(1),
    totalSpent: FieldValue.increment(total),
    lastOrderAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (existing) {
    const patch: Record<string, unknown> = { ...common };
    if (info.phone) patch.phone = info.phone;
    if (info.country) patch.country = info.country;
    tx.update(ref, patch);
  } else {
    tx.set(ref, {
      ...info,
      source: src, // first purchase source
      sourceRef,
      codeStatus: "none",
      currentCodeId: null,
      appUid: null,
      notes: "",
      createdAt: FieldValue.serverTimestamp(),
      ...common,
    });
  }
  return ref.id;
}

type StockState = "none" | "reserved" | "deducted" | "released" | "returned";

/** Applies the stock side-effects of moving an order into `target`. Returns the new stockState. */
async function stockEffects(
  tx: Transaction, lines: Line[], state: StockState, target: Status,
  ctx: { actor: Actor | null; orderId: string; channel: string; location: string },
  inv: Awaited<ReturnType<typeof readInventory>>,
): Promise<StockState> {
  const mctx = { ...ctx, note: `Order → ${target}` };
  if ((target === "paid" || target === "packing") && state === "none") {
    lines.forEach((l) => reserve(tx, inv.get(l.sku)!, l.qty, mctx));
    return "reserved";
  }
  if (["shipped", "delivered", "completed"].includes(target) && (state === "none" || state === "reserved")) {
    lines.forEach((l) => removeStock(tx, inv.get(l.sku)!, l.qty, "sale", mctx, { fromReserved: state === "reserved" }));
    return "deducted";
  }
  if ((target === "cancelled" || target === "refunded") && state === "reserved") {
    lines.forEach((l) => release(tx, inv.get(l.sku)!, l.qty, mctx));
    return "released";
  }
  if (target === "returned" && state === "deducted") {
    lines.forEach((l) => addStock(tx, inv.get(l.sku)!, l.qty, "return", mctx));
    return "returned";
  }
  return state;
}

interface NewOrder {
  orderId?: string; // deterministic id for imports (dedupe)
  src: Source;
  sourceRef: string;
  customer: CustomerInfo;
  lines: Line[];
  status: Status;
  shippingFee: number;
  currency: string;
  address: string;
  location: string;
  trackStock: boolean;
  notes: string;
  orderDate?: Date;
  corporateId?: string;
}

async function createOrderTx(o: NewOrder, actor: Actor | null): Promise<{ orderId: string; customerId: string; created: boolean }> {
  return db.runTransaction(async (tx) => {
    const ref = o.orderId ? db.collection("orders").doc(o.orderId) : db.collection("orders").doc();
    if (o.orderId && (await tx.get(ref)).exists) return { orderId: ref.id, customerId: "", created: false };

    const inv = o.trackStock ? await readInventory(tx, o.lines.map((l) => l.sku)) : new Map();
    const existingCustomer = await findCustomer(tx, o.customer);
    const orderNo = await nextCounter("orders", tx);

    // fill in item names from inventory
    o.lines.forEach((l) => { if (!l.name) l.name = inv.get(l.sku)?.name ?? l.sku; });
    const subtotal = o.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const total = Math.round((subtotal + o.shippingFee) * 100) / 100;

    const stockState: StockState = o.trackStock
      ? await stockEffects(tx, o.lines, "none", o.status,
        { actor, orderId: ref.id, channel: o.src, location: o.location }, inv)
      : "none";
    if (o.trackStock) commitInventory(tx, inv);

    const customerId = writeCustomer(tx, existingCustomer, o.customer, o.src, o.sourceRef, ref.id, total);
    const at = o.orderDate ? Timestamp.fromDate(o.orderDate) : Timestamp.now();
    tx.set(ref, {
      orderNo: `ORD-${String(orderNo).padStart(6, "0")}`,
      source: o.src,
      sourceRef: o.sourceRef,
      customerId,
      customer: o.customer,
      items: o.lines,
      currency: o.currency,
      subtotal: Math.round(subtotal * 100) / 100,
      shippingFee: o.shippingFee,
      total,
      status: o.status,
      stockState,
      trackStock: o.trackStock,
      fulfilmentLocation: o.location,
      shipping: { address: o.address, courier: "", trackingNo: "", shippedAt: null },
      corporateId: o.corporateId ?? null,
      notes: o.notes,
      timeline: [{ status: o.status, at, by: actor?.email ?? "system", note: "Order created" }],
      orderDate: at,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    audit(actor, "order.create", "orders", ref.id, { source: o.src, status: o.status, total }, tx);
    return { orderId: ref.id, customerId, created: true };
  });
}

async function maybeIssueCode(customerId: string, orderId: string, status: Status, src: Source, actor: Actor | null) {
  if (!customerId || !PAID_LIKE.includes(status) || src === "corporate") return;
  const settings = await getGeneralSettings();
  if (!settings.autoIssueCodeOnPaid) return;
  try {
    await issueCode(customerId, { orderId, actor, sendEmail: true, skipIfHasCode: true });
  } catch (e) {
    logger.warn("Auto code issue failed", { customerId, orderId, e });
  }
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

/** createOrder({ source, sourceRef?, customer, items, status?, shippingFee?, currency?, address?, location?, trackStock?, notes? }) */
export const createOrder = onCall({ region: REGION }, async (req) => {
  const actor = requireArea(req, "orders");
  const d = req.data ?? {};
  const settings = await getGeneralSettings();
  const o: NewOrder = {
    src: parseSource(d.source),
    sourceRef: str(d.sourceRef, "sourceRef", { max: 100 }),
    customer: parseCustomer(d.customer),
    lines: parseLines(d.items),
    status: d.status ? parseStatus(d.status) : "pending",
    shippingFee: d.shippingFee ? num(d.shippingFee, "shippingFee", { min: 0 }) : 0,
    currency: str(d.currency, "currency", { max: 3 }) || settings.currency,
    address: str(d.address, "address", { max: 500 }),
    location: str(d.location, "location") || settings.defaultLocation,
    trackStock: d.trackStock !== false,
    notes: str(d.notes, "notes", { max: 1000 }),
    corporateId: str(d.corporateId, "corporateId") || undefined,
  };
  if (!o.customer.name && !o.customer.email) throw new HttpsError("invalid-argument", "Customer name or email is required.");
  const res = await createOrderTx(o, actor);
  await maybeIssueCode(res.customerId, res.orderId, o.status, o.src, actor);
  return res;
});

/** updateOrderStatus({ orderId, status, note?, courier?, trackingNo? }) */
export const updateOrderStatus = onCall({ region: REGION }, async (req) => {
  const actor = requireArea(req, "orders");
  const orderId = str(req.data?.orderId, "orderId", { required: true });
  const target = parseStatus(req.data?.status);
  const note = str(req.data?.note, "note", { max: 500 });
  const courier = str(req.data?.courier, "courier", { max: 100 });
  const trackingNo = str(req.data?.trackingNo, "trackingNo", { max: 100 });

  const result = await db.runTransaction(async (tx) => {
    const ref = db.collection("orders").doc(orderId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Order not found.");
    const o = snap.data()!;
    const from = o.status as Status;
    if (!TRANSITIONS[from].includes(target)) {
      throw new HttpsError("failed-precondition", `Can't move an order from ${from} to ${target}.`);
    }
    const lines = o.items as Line[];
    const inv = o.trackStock ? await readInventory(tx, lines.map((l) => l.sku)) : new Map();
    const stockState = o.trackStock
      ? await stockEffects(tx, lines, o.stockState as StockState, target,
        { actor, orderId, channel: o.source, location: o.fulfilmentLocation }, inv)
      : o.stockState;
    if (o.trackStock) commitInventory(tx, inv);

    const patch: Record<string, unknown> = {
      status: target,
      stockState,
      updatedAt: FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion({ status: target, at: Timestamp.now(), by: actor.email, note }),
    };
    if (courier) patch["shipping.courier"] = courier;
    if (trackingNo) patch["shipping.trackingNo"] = trackingNo;
    if (target === "shipped") patch["shipping.shippedAt"] = FieldValue.serverTimestamp();
    tx.update(ref, patch);
    audit(actor, "order.status", "orders", orderId, { from, to: target, note }, tx);
    return { customerId: o.customerId as string, from, source: o.source as Source };
  });
  if (!PAID_LIKE.includes(result.from)) {
    await maybeIssueCode(result.customerId, orderId, target, result.source, actor);
  }
  return { ok: true };
});

/**
 * importOrders({ source, rows, trackStock = true, location? })
 * rows: [{ orderRef, name, email, phone?, country?, address?, sku, qty, unitPrice?, shippingFee?, status?, orderDate? }]
 * Rows sharing an orderRef become one order. Re-importing the same orderRef is skipped (deduped).
 */
export const importOrders = onCall({ region: REGION, timeoutSeconds: 300 }, async (req) => {
  const actor = requireArea(req, "orders");
  const src = parseSource(req.data?.source);
  const rows = req.data?.rows;
  if (!Array.isArray(rows) || !rows.length) throw new HttpsError("invalid-argument", "No rows to import.");
  if (rows.length > 1000) throw new HttpsError("invalid-argument", "Import at most 1000 rows at a time.");
  const settings = await getGeneralSettings();
  const location = str(req.data?.location, "location") || settings.defaultLocation;
  const trackStock = req.data?.trackStock !== false;

  const groups = new Map<string, any[]>();
  rows.forEach((r: any, i: number) => {
    const key = String(r?.orderRef ?? "").trim() || `row-${i + 1}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ ...r, _row: i + 2 }); // +2: header row + 1-based
  });

  const out = { created: 0, skipped: 0, codesIssued: 0, errors: [] as { orderRef: string; rows: number[]; error: string }[] };
  for (const [orderRef, group] of groups) {
    try {
      const first = group[0];
      const o: NewOrder = {
        orderId: `${src}_${orderRef.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120)}`,
        src,
        sourceRef: orderRef,
        customer: parseCustomer(first),
        lines: parseLines(group.map((r) => ({ sku: r.sku, qty: r.qty, unitPrice: r.unitPrice }))),
        status: first.status ? parseStatus(first.status) : "paid",
        shippingFee: first.shippingFee ? num(first.shippingFee, "shippingFee", { min: 0 }) : 0,
        currency: settings.currency,
        address: str(first.address, "address", { max: 500 }),
        location,
        trackStock,
        notes: "",
        orderDate: first.orderDate && !isNaN(Date.parse(first.orderDate)) ? new Date(first.orderDate) : undefined,
      };
      const res = await createOrderTx(o, actor);
      if (!res.created) { out.skipped++; continue; }
      out.created++;
      const before = (await db.collection("customers").doc(res.customerId).get()).data()?.codeStatus;
      await maybeIssueCode(res.customerId, res.orderId, o.status, o.src, actor);
      const after = (await db.collection("customers").doc(res.customerId).get()).data()?.codeStatus;
      if (before !== after) out.codesIssued++;
    } catch (e: any) {
      out.errors.push({ orderRef, rows: group.map((r) => r._row), error: e?.message ?? String(e) });
    }
  }
  await audit(actor, "order.import", "orders", src, { created: out.created, skipped: out.skipped, errors: out.errors.length });
  return out;
});
