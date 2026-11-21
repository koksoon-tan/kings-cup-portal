import { onCall } from "firebase-functions/v2/https";
import {
  db, FieldValue, HttpsError, REGION, Actor, audit, requireArea, str, int, num, getGeneralSettings,
} from "./common";
import type { Transaction, DocumentReference } from "firebase-admin/firestore";

/**
 * Inventory document: inventory/{sku}
 *  onHand        – physical units across all locations
 *  reserved      – units held by paid-but-unshipped orders
 *  byLocation    – { [locationId]: units }
 *  allocation    – { [channel]: max units for that channel } (absent / 0 = unlimited)
 *  soldByChannel / reservedByChannel – counters used to enforce the allocation (limited run)
 *
 * Every change writes one stockMovements doc, so the levels can always be audited/rebuilt.
 */
export interface Inv {
  ref: DocumentReference;
  sku: string;
  name: string;
  onHand: number;
  reserved: number;
  byLocation: Record<string, number>;
  allocation: Record<string, number>;
  soldByChannel: Record<string, number>;
  reservedByChannel: Record<string, number>;
  unitCost: number;
  dirty: boolean;
}

export type MovementType =
  | "stock_in" | "sale" | "reserve" | "release" | "return"
  | "sample" | "giveaway" | "damage" | "lost" | "adjustment" | "transfer" | "stocktake";

export interface MovementCtx {
  actor: Actor | null;
  location?: string;
  channel?: string;
  orderId?: string;
  corporateId?: string;
  sampleId?: string;
  note?: string;
}

export async function readInventory(tx: Transaction, skus: string[]): Promise<Map<string, Inv>> {
  const unique = [...new Set(skus)];
  const refs = unique.map((s) => db.collection("inventory").doc(s));
  const snaps = refs.length ? await tx.getAll(...refs) : [];
  const map = new Map<string, Inv>();
  snaps.forEach((snap, i) => {
    if (!snap.exists) throw new HttpsError("not-found", `SKU ${unique[i]} does not exist in inventory.`);
    const d = snap.data()!;
    map.set(unique[i], {
      ref: snap.ref,
      sku: unique[i],
      name: d.name ?? unique[i],
      onHand: d.onHand ?? 0,
      reserved: d.reserved ?? 0,
      byLocation: { ...(d.byLocation ?? {}) },
      allocation: { ...(d.allocation ?? {}) },
      soldByChannel: { ...(d.soldByChannel ?? {}) },
      reservedByChannel: { ...(d.reservedByChannel ?? {}) },
      unitCost: d.unitCost ?? 0,
      dirty: false,
    });
  });
  return map;
}

function bump(map: Record<string, number>, key: string, by: number) {
  map[key] = (map[key] ?? 0) + by;
  if (map[key] === 0) delete map[key];
}

function checkAllocation(inv: Inv, channel: string | undefined, qty: number) {
  if (!channel) return;
  const cap = inv.allocation[channel] ?? 0;
  if (cap <= 0) return;
  const used = (inv.soldByChannel[channel] ?? 0) + (inv.reservedByChannel[channel] ?? 0);
  if (used + qty > cap) {
    throw new HttpsError(
      "failed-precondition",
      `${inv.sku}: allocation for ${channel} is ${cap}, ${used} already used – cannot take ${qty} more.`,
    );
  }
}

function writeMovement(
  tx: Transaction, inv: Inv, type: MovementType, qty: number, reservedDelta: number,
  ctx: MovementCtx, extra: Record<string, unknown> = {},
) {
  tx.set(db.collection("stockMovements").doc(), {
    sku: inv.sku,
    skuName: inv.name,
    type,
    qty, // signed change to onHand
    reservedDelta,
    location: ctx.location ?? null,
    channel: ctx.channel ?? null,
    orderId: ctx.orderId ?? null,
    corporateId: ctx.corporateId ?? null,
    sampleId: ctx.sampleId ?? null,
    note: ctx.note ?? "",
    onHandAfter: inv.onHand,
    reservedAfter: inv.reserved,
    by: ctx.actor ? { uid: ctx.actor.uid, email: ctx.actor.email } : { uid: "system", email: "system" },
    at: FieldValue.serverTimestamp(),
    ...extra,
  });
}

/** Hold stock for a paid order. */
export function reserve(tx: Transaction, inv: Inv, qty: number, ctx: MovementCtx) {
  if (inv.onHand - inv.reserved < qty) {
    throw new HttpsError("failed-precondition", `${inv.sku}: only ${inv.onHand - inv.reserved} available, need ${qty}.`);
  }
  checkAllocation(inv, ctx.channel, qty);
  inv.reserved += qty;
  if (ctx.channel) bump(inv.reservedByChannel, ctx.channel, qty);
  inv.dirty = true;
  writeMovement(tx, inv, "reserve", 0, qty, ctx);
}

/** Release a reservation (order cancelled before shipping). */
export function release(tx: Transaction, inv: Inv, qty: number, ctx: MovementCtx) {
  inv.reserved = Math.max(0, inv.reserved - qty);
  if (ctx.channel) bump(inv.reservedByChannel, ctx.channel, -Math.min(qty, inv.reservedByChannel[ctx.channel] ?? 0));
  inv.dirty = true;
  writeMovement(tx, inv, "release", 0, -qty, ctx);
}

/** Remove physical stock from a location (sale, sample, damage …). */
export function removeStock(
  tx: Transaction, inv: Inv, qty: number, type: MovementType, ctx: MovementCtx & { location: string },
  opts: { fromReserved?: boolean } = {},
) {
  const atLoc = inv.byLocation[ctx.location] ?? 0;
  if (atLoc < qty) {
    throw new HttpsError("failed-precondition", `${inv.sku}: only ${atLoc} at location "${ctx.location}", need ${qty}.`);
  }
  if (!opts.fromReserved && inv.onHand - inv.reserved < qty) {
    throw new HttpsError("failed-precondition", `${inv.sku}: only ${inv.onHand - inv.reserved} unreserved units available.`);
  }
  if (type === "sale" && !opts.fromReserved) checkAllocation(inv, ctx.channel, qty);
  inv.onHand -= qty;
  bump(inv.byLocation, ctx.location, -qty);
  let reservedDelta = 0;
  if (opts.fromReserved) {
    reservedDelta = -Math.min(qty, inv.reserved);
    inv.reserved += reservedDelta;
    if (ctx.channel) bump(inv.reservedByChannel, ctx.channel, -Math.min(qty, inv.reservedByChannel[ctx.channel] ?? 0));
  }
  if (type === "sale" && ctx.channel) bump(inv.soldByChannel, ctx.channel, qty);
  inv.dirty = true;
  writeMovement(tx, inv, type, -qty, reservedDelta, ctx);
}

/** Add physical stock to a location (stock in, customer return …). */
export function addStock(
  tx: Transaction, inv: Inv, qty: number, type: MovementType, ctx: MovementCtx & { location: string },
  extra: Record<string, unknown> = {},
) {
  inv.onHand += qty;
  bump(inv.byLocation, ctx.location, qty);
  if (type === "return" && ctx.channel) {
    bump(inv.soldByChannel, ctx.channel, -Math.min(qty, inv.soldByChannel[ctx.channel] ?? 0));
  }
  inv.dirty = true;
  writeMovement(tx, inv, type, qty, 0, ctx, extra);
}

export function commitInventory(tx: Transaction, map: Map<string, Inv>) {
  for (const inv of map.values()) {
    if (!inv.dirty) continue;
    tx.update(inv.ref, {
      onHand: inv.onHand,
      reserved: inv.reserved,
      byLocation: inv.byLocation,
      soldByChannel: inv.soldByChannel,
      reservedByChannel: inv.reservedByChannel,
      unitCost: inv.unitCost,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

async function assertLocation(loc: string) {
  const settings = await getGeneralSettings();
  if (!settings.locations.some((l) => l.id === loc)) {
    throw new HttpsError("invalid-argument", `Unknown location "${loc}". Add it in Settings first.`);
  }
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

/**
 * adjustStock({ sku, type, qty, location, toLocation?, note?, poNumber?, unitCost? })
 *  stock_in   : qty > 0 received at location (updates weighted-average unit cost)
 *  sample | giveaway | damage | lost : qty > 0 removed from location
 *  adjustment : signed qty correction at location
 *  transfer   : qty > 0 moved from location to toLocation
 */
export const adjustStock = onCall({ region: REGION }, async (req) => {
  const actor = requireArea(req, "inventory");
  const d = req.data ?? {};
  const sku = str(d.sku, "sku", { required: true });
  const type = str(d.type, "type", { required: true }) as MovementType;
  const location = str(d.location, "location", { required: true });
  const note = str(d.note, "note", { max: 500 });
  await assertLocation(location);

  const allowed: MovementType[] = ["stock_in", "sample", "giveaway", "damage", "lost", "adjustment", "transfer"];
  if (!allowed.includes(type)) throw new HttpsError("invalid-argument", `Unsupported type ${type}.`);
  const qty = type === "adjustment" ? int(d.qty, "qty") : int(d.qty, "qty", { min: 1 });
  if (qty === 0) throw new HttpsError("invalid-argument", "qty cannot be 0.");

  let toLocation = "";
  if (type === "transfer") {
    toLocation = str(d.toLocation, "toLocation", { required: true });
    if (toLocation === location) throw new HttpsError("invalid-argument", "Pick two different locations.");
    await assertLocation(toLocation);
  }

  await db.runTransaction(async (tx) => {
    const map = await readInventory(tx, [sku]);
    const inv = map.get(sku)!;
    const ctx = { actor, location, note };
    switch (type) {
      case "stock_in": {
        const poNumber = str(d.poNumber, "poNumber", { max: 100 });
        const unitCost = d.unitCost === undefined || d.unitCost === "" ? inv.unitCost : num(d.unitCost, "unitCost", { min: 0 });
        const prevUnits = Math.max(inv.onHand, 0);
        inv.unitCost = prevUnits + qty > 0
          ? Math.round(((inv.unitCost * prevUnits + unitCost * qty) / (prevUnits + qty)) * 10000) / 10000
          : unitCost;
        addStock(tx, inv, qty, "stock_in", ctx, { poNumber, unitCost });
        break;
      }
      case "adjustment":
        if (qty > 0) addStock(tx, inv, qty, "adjustment", ctx);
        else removeStock(tx, inv, -qty, "adjustment", ctx);
        break;
      case "transfer":
        // A transfer doesn't change onHand – just moves between locations.
        if ((inv.byLocation[location] ?? 0) < qty) {
          throw new HttpsError("failed-precondition", `Only ${inv.byLocation[location] ?? 0} at ${location}.`);
        }
        bump(inv.byLocation, location, -qty);
        bump(inv.byLocation, toLocation, qty);
        inv.dirty = true;
        writeMovement(tx, inv, "transfer", 0, 0, ctx, { toLocation, transferQty: qty });
        break;
      default:
        removeStock(tx, inv, qty, type, ctx);
    }
    commitInventory(tx, map);
    audit(actor, `stock.${type}`, "inventory", sku, { qty, location, toLocation, note }, tx);
  });
  return { ok: true };
});

/** stockTake({ sku, counts: { [locationId]: countedUnits }, note? }) – posts the differences. */
export const stockTake = onCall({ region: REGION }, async (req) => {
  const actor = requireArea(req, "inventory");
  const sku = str(req.data?.sku, "sku", { required: true });
  const counts = req.data?.counts;
  if (!counts || typeof counts !== "object") throw new HttpsError("invalid-argument", "counts is required.");
  const note = str(req.data?.note, "note", { max: 500 });
  for (const loc of Object.keys(counts)) await assertLocation(loc);

  const diffs: Record<string, number> = {};
  await db.runTransaction(async (tx) => {
    const map = await readInventory(tx, [sku]);
    const inv = map.get(sku)!;
    for (const [loc, raw] of Object.entries(counts)) {
      const counted = int(raw, `count for ${loc}`, { min: 0 });
      const diff = counted - (inv.byLocation[loc] ?? 0);
      if (diff === 0) continue;
      diffs[loc] = diff;
      inv.onHand += diff;
      bump(inv.byLocation, loc, diff);
      inv.dirty = true;
      writeMovement(tx, inv, "stocktake", diff, 0, { actor, location: loc, note }, { counted });
    }
    if (inv.onHand < inv.reserved) {
      throw new HttpsError("failed-precondition",
        `Counted stock (${inv.onHand}) is below units reserved for paid orders (${inv.reserved}). Resolve those orders first.`);
    }
    commitInventory(tx, map);
    audit(actor, "stock.stocktake", "inventory", sku, { diffs, note }, tx);
  });
  return { ok: true, diffs };
});
