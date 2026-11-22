/**
 * Demo mode: an in-browser stand-in for Firestore, Auth and Storage so the whole
 * dashboard — including the real Cloud Functions code in functions/src — runs
 * without any server. Data persists in localStorage (documents) and IndexedDB (files).
 */

// ---------------------------------------------------------------------------
// Timestamp + sentinels
// ---------------------------------------------------------------------------
export class Timestamp {
  constructor(public readonly seconds: number, public readonly nanoseconds: number) {}
  static now() { return Timestamp.fromMillis(Date.now()); }
  static fromDate(d: Date) { return Timestamp.fromMillis(d.getTime()); }
  static fromMillis(ms: number) { return new Timestamp(Math.floor(ms / 1000), Math.round((ms % 1000) * 1e6)); }
  toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
  toDate() { return new Date(this.toMillis()); }
  isEqual(o: Timestamp) { return o instanceof Timestamp && o.toMillis() === this.toMillis(); }
  valueOf() { return String(this.toMillis()).padStart(15, "0"); }
}

type Sentinel = { __sentinel: "ts" } | { __sentinel: "inc"; by: number } | { __sentinel: "union"; values: unknown[] } | { __sentinel: "delete" };
const S = (s: Sentinel) => s;
export const sentinels = {
  serverTimestamp: () => S({ __sentinel: "ts" }),
  increment: (by: number) => S({ __sentinel: "inc", by }),
  arrayUnion: (...values: unknown[]) => S({ __sentinel: "union", values }),
  delete: () => S({ __sentinel: "delete" }),
};
const isSentinel = (v: any): v is Sentinel => v && typeof v === "object" && "__sentinel" in v;
const isPlain = (v: any) => v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Timestamp) && !isSentinel(v)
  && !(v instanceof Uint8Array) && Object.getPrototypeOf(v) === Object.prototype;

/** Normalises a value as Firestore would store it (Dates → Timestamps, deep copy). */
function clean(v: any, existing?: any): any {
  if (isSentinel(v)) {
    if (v.__sentinel === "ts") return Timestamp.now();
    if (v.__sentinel === "inc") return (typeof existing === "number" ? existing : 0) + v.by;
    if (v.__sentinel === "union") {
      const arr = Array.isArray(existing) ? [...existing] : [];
      for (const x of v.values) if (!arr.some((a) => JSON.stringify(a) === JSON.stringify(x))) arr.push(clean(x));
      return arr;
    }
    return undefined;
  }
  if (v instanceof Date) return Timestamp.fromDate(v);
  if (v instanceof Timestamp) return v;
  if (v && typeof v === "object" && typeof v.toMillis === "function" && "seconds" in v) return Timestamp.fromMillis(v.toMillis());
  if (Array.isArray(v)) return v.map((x) => clean(x));
  if (v && typeof v === "object") {
    const out: any = {};
    for (const [k, x] of Object.entries(v)) {
      if (x === undefined) continue;
      const c = clean(x, existing?.[k]);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return v;
}

function deepMerge(base: any, patch: any): any {
  const out = isPlain(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (isSentinel(v) && v.__sentinel === "delete") { delete out[k]; continue; }
    out[k] = isPlain(v) && isPlain(out[k]) ? deepMerge(out[k], v) : clean(v, out[k]);
  }
  return out;
}

function setPath(obj: any, path: string, value: any) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isPlain(cur[parts[i]])) cur[parts[i]] = {};
    else cur[parts[i]] = { ...cur[parts[i]] };
    cur = cur[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (isSentinel(value) && value.__sentinel === "delete") delete cur[last];
  else {
    const c = clean(value, cur[last]);
    if (c !== undefined) cur[last] = c;
  }
}

export function deepClone<T>(v: T): T {
  if (v instanceof Timestamp) return v;
  if (Array.isArray(v)) return v.map(deepClone) as any;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepClone(x)])) as any;
  return v;
}

// ---------------------------------------------------------------------------
// Document store
// ---------------------------------------------------------------------------
const LS_KEY = "kc-demo-db-v1";
const docs = new Map<string, any>();

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw, (_k, v) => (v && typeof v === "object" && "__ts" in v ? Timestamp.fromMillis(v.__ts) : v));
    for (const [k, v] of Object.entries(parsed.docs ?? {})) docs.set(k, v);
    Object.assign(users, parsed.users ?? {});
    session.uid = parsed.session ?? null;
  } catch { /* private mode etc. */ }
}

let saveTimer: any = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const out = JSON.stringify({ docs: Object.fromEntries(docs), users, session: session.uid }, function (k, v) {
        const raw = (this as any)[k];
        return raw instanceof Timestamp ? { __ts: raw.toMillis() } : v;
      });
      localStorage.setItem(LS_KEY, out);
    } catch (e) { console.warn("Demo data could not be saved", e); }
  }, 150);
}

export const store = {
  get: (path: string) => (docs.has(path) ? deepClone(docs.get(path)) : undefined),
  has: (path: string) => docs.has(path),
  /** Direct children docs of a collection path. */
  list(collPath: string): { id: string; path: string; data: any }[] {
    const depth = collPath.split("/").length + 1;
    const out = [];
    for (const [p, d] of docs) {
      if (p.startsWith(collPath + "/") && p.split("/").length === depth) out.push({ id: p.slice(collPath.length + 1), path: p, data: deepClone(d) });
    }
    return out;
  },
};

export type Write =
  | { op: "set"; path: string; data: any; merge?: boolean }
  | { op: "update"; path: string; data: Record<string, any> }
  | { op: "delete"; path: string };

/** Applies writes atomically and notifies listeners + triggers. */
export function commit(writes: Write[]) {
  const before = new Map<string, any>();
  const staged = new Map<string, any>();
  const cur = (p: string) => (staged.has(p) ? staged.get(p) : docs.get(p));
  for (const w of writes) {
    if (!before.has(w.path)) before.set(w.path, docs.get(w.path));
    const existing = cur(w.path);
    if (w.op === "delete") staged.set(w.path, undefined);
    else if (w.op === "set") staged.set(w.path, w.merge ? deepMerge(existing, w.data) : clean(w.data));
    else {
      if (existing === undefined) throw Object.assign(new Error(`No document to update: ${w.path}`), { code: "not-found" });
      const next = deepClone(existing);
      for (const [k, v] of Object.entries(w.data)) setPath(next, k, v);
      staged.set(w.path, next);
    }
  }
  for (const [p, d] of staged) (d === undefined ? docs.delete(p) : docs.set(p, d));
  persist();
  notify();
  for (const [p, d] of staged) fireDocTriggers(p, before.get(p), d);
}

export function newId() {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  const r = crypto.getRandomValues(new Uint8Array(20));
  r.forEach((b) => (s += c[b % c.length]));
  return s;
}

// listeners
const listeners = new Set<() => void>();
let pending = false;
function notify() {
  if (pending) return;
  pending = true;
  setTimeout(() => { pending = false; listeners.forEach((l) => { try { l(); } catch (e) { console.error(e); } }); }, 0);
}
export function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

// ---------------------------------------------------------------------------
// Triggers (stand-ins for Cloud Functions background triggers)
// ---------------------------------------------------------------------------
type DocTrigger = { re: RegExp; names: string[]; kind: "updated"; handler: (e: any) => any };
const docTriggers: DocTrigger[] = [];
export function registerDocTrigger(pattern: string, kind: "updated", handler: (e: any) => any) {
  const names: string[] = [];
  const re = new RegExp("^" + pattern.replace(/\{(\w+)\}/g, (_, n) => { names.push(n); return "([^/]+)"; }) + "$");
  docTriggers.push({ re, names, kind, handler });
}
const snap = (d: any) => ({ exists: d !== undefined, data: () => deepClone(d) });
function fireDocTriggers(path: string, before: any, after: any) {
  // Simulated "Trigger Email" extension: deliver queued mail after a moment.
  if (/^mail\/[^/]+$/.test(path) && before === undefined && after) {
    setTimeout(() => { if (docs.has(path)) commit([{ op: "update", path, data: { delivery: { state: "SUCCESS", endTime: Timestamp.now() } } }]); }, 1500);
  }
  for (const t of docTriggers) {
    const m = path.match(t.re);
    if (!m || before === undefined || after === undefined) continue;
    const params = Object.fromEntries(t.names.map((n, i) => [n, m[i + 1]]));
    setTimeout(() => Promise.resolve(t.handler({ params, data: { before: snap(before), after: snap(after) } })).catch(console.error), 0);
  }
}

const storageTriggers: ((e: any) => any)[] = [];
export function registerStorageTrigger(handler: (e: any) => any) { storageTriggers.push(handler); }

// ---------------------------------------------------------------------------
// Files (IndexedDB with in-memory fallback)
// ---------------------------------------------------------------------------
const memFiles = new Map<string, Blob>();
let idb: Promise<IDBDatabase | null> | null = null;
function openIdb() {
  if (!idb) idb = new Promise((resolve) => {
    try {
      const req = indexedDB.open("kc-demo-files", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("files");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return idb;
}
async function idbOp<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await openIdb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction("files", mode).objectStore("files"));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
}
const urlCache = new Map<string, string>();
export const files = {
  async put(path: string, data: Blob | Uint8Array | ArrayBuffer, contentType?: string) {
    const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: contentType ?? "application/octet-stream" });
    memFiles.set(path, blob);
    urlCache.delete(path);
    await idbOp("readwrite", (s) => s.put(blob, path));
    return blob;
  },
  async get(path: string): Promise<Blob | undefined> {
    if (memFiles.has(path)) return memFiles.get(path);
    const b = (await idbOp<Blob>("readonly", (s) => s.get(path))) as Blob | undefined;
    if (b) memFiles.set(path, b);
    return b;
  },
  async url(path: string) {
    if (!urlCache.has(path)) {
      const b = await files.get(path);
      if (!b) throw Object.assign(new Error(`File not found: ${path}`), { code: "storage/object-not-found" });
      urlCache.set(path, URL.createObjectURL(b));
    }
    return urlCache.get(path)!;
  },
  async finalize(path: string) {
    for (const h of storageTriggers) await Promise.resolve(h({ data: { name: path, bucket: "demo-bucket" } })).catch(console.error);
  },
};

// ---------------------------------------------------------------------------
// Auth users + session
// ---------------------------------------------------------------------------
export interface DemoUser { uid: string; email: string; password?: string; displayName?: string; disabled?: boolean; claims: Record<string, any> }
export const users: Record<string, DemoUser> = {};
export const session: { uid: string | null } = { uid: null };
const authListeners = new Set<() => void>();
export const authBus = {
  subscribe(fn: () => void) { authListeners.add(fn); return () => { authListeners.delete(fn); }; },
  emit() { persist(); authListeners.forEach((f) => f()); },
};
export function saveUsers() { persist(); }

export async function resetDemo() {
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
  await idbOp("readwrite", (s) => s.clear());
}

load();
