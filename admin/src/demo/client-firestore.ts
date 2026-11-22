// Stand-in for "firebase/firestore" (only the API surface the dashboard uses).
import { Timestamp, sentinels, store, commit, newId, subscribe } from "./core";
export { Timestamp };

export type DocumentData = Record<string, any>;
export type FirestoreError = Error & { code?: string };
type Ref = { type: "doc"; path: string; id: string } | { type: "collection"; path: string; id: string };
export type DocumentReference = Extract<Ref, { type: "doc" }>;
export type QueryConstraint = { kind: "where"; f: string; op: string; v: any } | { kind: "orderBy"; f: string; dir: "asc" | "desc" } | { kind: "limit"; n: number };
export type Query = { type: "query"; path: string; constraints: QueryConstraint[] };

export const getFirestore = (_app?: unknown) => ({ __db: true });
export const connectFirestoreEmulator = () => undefined;

function join(base: any, segs: string[]) {
  const parts = [...(base && base.path ? [base.path] : []), ...segs].join("/").split("/").filter(Boolean);
  return parts.join("/");
}
export function collection(base: any, ...segs: string[]): Ref {
  const path = join(base, segs);
  return { type: "collection", path, id: path.split("/").pop()! };
}
export function doc(base: any, ...segs: string[]): DocumentReference {
  let path = join(base, segs);
  if (base?.type === "collection" && !segs.length) path = `${base.path}/${newId()}`;
  return { type: "doc", path, id: path.split("/").pop()! };
}
export const where = (f: string, op: string, v: any): QueryConstraint => ({ kind: "where", f, op, v });
export const orderBy = (f: string, dir: "asc" | "desc" = "asc"): QueryConstraint => ({ kind: "orderBy", f, dir });
export const limit = (n: number): QueryConstraint => ({ kind: "limit", n });
export function query(ref: Ref | Query, ...constraints: QueryConstraint[]): Query {
  return { type: "query", path: ref.path, constraints: [...((ref as Query).constraints ?? []), ...constraints] };
}

const get = (o: any, f: string) => f.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
const key = (v: any) => (v instanceof Timestamp ? v.toMillis() : v);
function cmp(a: any, b: any) {
  const x = key(a), y = key(b);
  if (typeof x !== typeof y) return typeof x < typeof y ? -1 : 1;
  return x < y ? -1 : x > y ? 1 : 0;
}
function matches(d: any, c: Extract<QueryConstraint, { kind: "where" }>) {
  const v = get(d, c.f);
  if (c.op === "==") return JSON.stringify(key(v)) === JSON.stringify(key(c.v));
  if (c.op === "in") return c.v.some((x: any) => JSON.stringify(key(x)) === JSON.stringify(key(v)));
  if (c.op === "array-contains") return Array.isArray(v) && v.includes(c.v);
  if (v == null || typeof key(v) !== typeof key(c.v)) return false;
  const r = cmp(v, c.v);
  return c.op === "<" ? r < 0 : c.op === "<=" ? r <= 0 : c.op === ">" ? r > 0 : c.op === ">=" ? r >= 0 : c.op === "!=" ? r !== 0 : false;
}
export function runQuery(q: Query | Ref) {
  let rows = store.list(q.path);
  const cons = (q as Query).constraints ?? [];
  for (const c of cons) if (c.kind === "where") rows = rows.filter((r) => matches(r.data, c));
  const orders = cons.filter((c): c is Extract<QueryConstraint, { kind: "orderBy" }> => c.kind === "orderBy");
  for (const o of orders) rows = rows.filter((r) => get(r.data, o.f) !== undefined);
  if (orders.length) rows.sort((a, b) => {
    for (const o of orders) { const r = cmp(get(a.data, o.f), get(b.data, o.f)); if (r) return o.dir === "desc" ? -r : r; }
    return 0;
  });
  const lim = cons.find((c) => c.kind === "limit") as { n: number } | undefined;
  if (lim) rows = rows.slice(0, lim.n);
  return rows;
}

const docSnap = (ref: DocumentReference) => {
  const d = store.get(ref.path);
  return { id: ref.id, ref, exists: () => d !== undefined, data: () => d };
};
const querySnap = (q: Query | Ref) => {
  const docs = runQuery(q).map((r) => ({ id: r.id, ref: doc({ path: q.path }, r.id), exists: () => true, data: () => r.data }));
  return { docs, empty: !docs.length, size: docs.length, forEach: (f: any) => docs.forEach(f) };
};

const tick = () => new Promise((r) => setTimeout(r, 30));
export async function getDoc(ref: DocumentReference) { await tick(); return docSnap(ref); }
export async function getDocs(q: Query | Ref) { await tick(); return querySnap(q); }
export async function setDoc(ref: DocumentReference, data: any, opts?: { merge?: boolean }) { await tick(); commit([{ op: "set", path: ref.path, data, merge: opts?.merge }]); }
export async function updateDoc(ref: DocumentReference, data: any) { await tick(); commit([{ op: "update", path: ref.path, data }]); }
export async function deleteDoc(ref: DocumentReference) { await tick(); commit([{ op: "delete", path: ref.path }]); }
export async function addDoc(coll: Ref, data: any) { const ref = doc(coll); await setDoc(ref, data); return ref; }
export const serverTimestamp = sentinels.serverTimestamp;
export const increment = sentinels.increment;
export const arrayUnion = sentinels.arrayUnion;

export function onSnapshot(target: any, next: (s: any) => void, _err?: (e: any) => void) {
  let last = "";
  const run = () => {
    const s = target.type === "doc" ? docSnap(target) : querySnap(target);
    const sig = JSON.stringify(target.type === "doc" ? s.data?.() ?? null : (s as any).docs.map((d: any) => [d.id, d.data()]));
    if (sig === last) return;
    last = sig;
    next(s);
  };
  setTimeout(run, 0);
  return subscribe(run);
}

export async function getCountFromServer(q: Query) { await tick(); const n = runQuery(q).length; return { data: () => ({ count: n }) }; }
export const sum = (field: string) => ({ sum: field });
export async function getAggregateFromServer(q: Query, spec: Record<string, { sum: string }>) {
  await tick();
  const rows = runQuery(q);
  const out: Record<string, number> = {};
  for (const [k, s] of Object.entries(spec)) out[k] = rows.reduce((a, r) => a + (Number(get(r.data, s.sum)) || 0), 0);
  return { data: () => out };
}
