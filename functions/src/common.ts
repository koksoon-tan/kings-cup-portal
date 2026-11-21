import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp, Transaction } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, CallableRequest } from "firebase-functions/v2/https";

if (!getApps().length) initializeApp();

export const db = getFirestore();
export const auth = getAuth();
export const storage = getStorage();
export { FieldValue, Timestamp, HttpsError };

/** Region for every function. Keep it in the same region as your Firestore DB / Storage bucket. */
export const REGION = "asia-southeast1";

// ---------------------------------------------------------------------------
// Roles & permissions (mirror of admin/src/lib/roles.ts – keep in sync)
// ---------------------------------------------------------------------------
export type Role = "superadmin" | "admin" | "ops" | "sales";
export const ROLES: Role[] = ["superadmin", "admin", "ops", "sales"];

export type Area =
  | "staff" | "settings" | "decks" | "inventory" | "orders"
  | "customers" | "codes" | "corporates" | "invoices" | "samples";

export const PERMISSIONS: Record<Area, Role[]> = {
  staff: ["superadmin"],
  settings: ["superadmin", "admin"],
  decks: ["superadmin", "admin"],
  inventory: ["superadmin", "admin", "ops"],
  orders: ["superadmin", "admin", "ops"],
  customers: ["superadmin", "admin", "ops", "sales"],
  codes: ["superadmin", "admin", "ops"],
  corporates: ["superadmin", "admin", "sales"],
  invoices: ["superadmin", "admin", "sales"],
  samples: ["superadmin", "admin", "ops", "sales"],
};

export interface Actor { uid: string; email: string; role: Role }

/** Throws unless the caller is signed-in staff allowed to act on `area`. */
export function requireArea(req: CallableRequest, area: Area): Actor {
  const token = req.auth?.token;
  if (!req.auth || !token) throw new HttpsError("unauthenticated", "Sign in first.");
  const role = token.role as Role | undefined;
  if (!role || !PERMISSIONS[area].includes(role)) {
    throw new HttpsError("permission-denied", `Your role cannot manage ${area}.`);
  }
  return { uid: req.auth.uid, email: (token.email as string) ?? "", role };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
export function str(v: unknown, field: string, opts: { required?: boolean; max?: number } = {}): string {
  if (v === undefined || v === null || v === "") {
    if (opts.required) throw new HttpsError("invalid-argument", `${field} is required.`);
    return "";
  }
  if (typeof v !== "string") throw new HttpsError("invalid-argument", `${field} must be text.`);
  const s = v.trim();
  if (opts.max && s.length > opts.max) throw new HttpsError("invalid-argument", `${field} is too long.`);
  return s;
}

export function int(v: unknown, field: string, opts: { min?: number; max?: number } = {}): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n)) {
    throw new HttpsError("invalid-argument", `${field} must be a whole number.`);
  }
  if (opts.min !== undefined && n < opts.min) throw new HttpsError("invalid-argument", `${field} must be ≥ ${opts.min}.`);
  if (opts.max !== undefined && n > opts.max) throw new HttpsError("invalid-argument", `${field} must be ≤ ${opts.max}.`);
  return n;
}

export function num(v: unknown, field: string, opts: { min?: number } = {}): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new HttpsError("invalid-argument", `${field} must be a number.`);
  if (opts.min !== undefined && n < opts.min) throw new HttpsError("invalid-argument", `${field} must be ≥ ${opts.min}.`);
  return n;
}

export function normEmail(v: unknown): string {
  const e = str(v, "email").toLowerCase();
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpsError("invalid-argument", `Invalid email: ${e}`);
  return e;
}

/** Writes an audit-log entry (optionally inside a transaction). */
export function audit(
  actor: { uid: string; email: string } | null,
  action: string,
  entity: string,
  entityId: string,
  details: Record<string, unknown> = {},
  tx?: Transaction,
) {
  const ref = db.collection("auditLogs").doc();
  const data = {
    action, entity, entityId, details,
    by: actor ? { uid: actor.uid, email: actor.email } : { uid: "system", email: "system" },
    at: FieldValue.serverTimestamp(),
  };
  return tx ? tx.set(ref, data) : ref.set(data);
}

/** Atomically increments a named counter and returns the new value. */
export async function nextCounter(name: string, tx: Transaction): Promise<number> {
  const ref = db.collection("counters").doc(name);
  const snap = await tx.get(ref);
  const value = ((snap.exists ? (snap.data()!.value as number) : 0) || 0) + 1;
  tx.set(ref, { value }, { merge: true });
  return value;
}

export const SOURCES = ["kickstarter", "shopee", "lazada", "website", "app", "corporate", "manual"] as const;
export type Source = (typeof SOURCES)[number];

export function source(v: unknown): Source {
  const s = str(v, "source", { required: true }).toLowerCase();
  if (!(SOURCES as readonly string[]).includes(s)) throw new HttpsError("invalid-argument", `Unknown source: ${s}`);
  return s as Source;
}

export interface GeneralSettings {
  currency: string;
  autoIssueCodeOnPaid: boolean;
  codeExpiryDays: number; // 0 = never
  locations: { id: string; name: string }[];
  defaultLocation: string;
}

export const DEFAULT_GENERAL: GeneralSettings = {
  currency: "MYR",
  autoIssueCodeOnPaid: true,
  codeExpiryDays: 0,
  locations: [{ id: "main", name: "Main warehouse" }],
  defaultLocation: "main",
};

export async function getGeneralSettings(tx?: Transaction): Promise<GeneralSettings> {
  const ref = db.collection("settings").doc("general");
  const snap = tx ? await tx.get(ref) : await ref.get();
  return { ...DEFAULT_GENERAL, ...(snap.data() ?? {}) } as GeneralSettings;
}
