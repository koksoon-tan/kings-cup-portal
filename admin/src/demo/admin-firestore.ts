// Stand-in for "firebase-admin/firestore", used by the real functions code.
import { Timestamp, sentinels, store, commit, newId, Write } from "./core";
import { runQuery, QueryConstraint } from "./client-firestore";
export { Timestamp };

export const FieldValue = {
  serverTimestamp: sentinels.serverTimestamp,
  increment: sentinels.increment,
  arrayUnion: sentinels.arrayUnion,
  delete: sentinels.delete,
};

class DocSnap {
  constructor(public ref: DocRef, private d: any) {}
  get id() { return this.ref.id; }
  get exists() { return this.d !== undefined; }
  data() { return this.d; }
  get(f: string) { return f.split(".").reduce((a: any, k) => a?.[k], this.d); }
}

class Query {
  constructor(public path: string, public constraints: QueryConstraint[] = []) {}
  where(f: string, op: string, v: any) { return new Query(this.path, [...this.constraints, { kind: "where", f, op, v }]); }
  orderBy(f: string, dir: "asc" | "desc" = "asc") { return new Query(this.path, [...this.constraints, { kind: "orderBy", f, dir }]); }
  limit(n: number) { return new Query(this.path, [...this.constraints, { kind: "limit", n }]); }
  _run() {
    const docs = runQuery({ type: "query", path: this.path, constraints: this.constraints })
      .map((r) => new DocSnap(new DocRef(r.path), r.data));
    return { docs, empty: !docs.length, size: docs.length, forEach: (f: any) => docs.forEach(f) };
  }
  async get() { return this._run(); }
}

class CollRef extends Query {
  get id() { return this.path.split("/").pop()!; }
  doc(id?: string) { return new DocRef(`${this.path}/${id ?? newId()}`); }
  async add(data: any) { const r = this.doc(); await r.set(data); return r; }
}

class DocRef {
  constructor(public path: string) {}
  get id() { return this.path.split("/").pop()!; }
  collection(name: string) { return new CollRef(`${this.path}/${name}`); }
  async get() { return new DocSnap(this, store.get(this.path)); }
  async set(data: any, opts?: { merge?: boolean }) { commit([{ op: "set", path: this.path, data, merge: opts?.merge }]); }
  async update(data: any) { commit([{ op: "update", path: this.path, data }]); }
  async delete() { commit([{ op: "delete", path: this.path }]); }
}

class Tx {
  writes: Write[] = [];
  async get(t: DocRef | Query) { return t instanceof DocRef ? new DocSnap(t, store.get(t.path)) : t._run(); }
  async getAll(...refs: DocRef[]) { return refs.map((r) => new DocSnap(r, store.get(r.path))); }
  set(r: DocRef, data: any, opts?: { merge?: boolean }) { this.writes.push({ op: "set", path: r.path, data, merge: opts?.merge }); return this; }
  update(r: DocRef, data: any) { this.writes.push({ op: "update", path: r.path, data }); return this; }
  delete(r: DocRef) { this.writes.push({ op: "delete", path: r.path }); return this; }
}
export type Transaction = Tx;
export type DocumentReference = DocRef;

// Transactions run one at a time, like Firestore's serialisable isolation.
let queue: Promise<unknown> = Promise.resolve();
const db = {
  collection: (p: string) => new CollRef(p),
  doc: (p: string) => new DocRef(p),
  getAll: async (...refs: DocRef[]) => refs.map((r) => new DocSnap(r, store.get(r.path))),
  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      const tx = new Tx();
      const res = await fn(tx);
      commit(tx.writes);
      return res;
    });
    queue = run.catch(() => undefined);
    return run;
  },
  batch() {
    const tx = new Tx();
    return { set: tx.set.bind(tx), update: tx.update.bind(tx), delete: tx.delete.bind(tx), commit: async () => commit(tx.writes) };
  },
};
export const getFirestore = (_app?: unknown) => db;
