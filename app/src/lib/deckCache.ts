// Card images and fonts saved on the device (IndexedDB), so a game runs without Wi-Fi.
const DB = "kc-play-cache", STORE = "files";
let dbp: Promise<IDBDatabase | null> | null = null;
const mem = new Map<string, Blob | string>();

function open(): Promise<IDBDatabase | null> {
  return (dbp ??= new Promise((resolve) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    } catch { resolve(null); }
  }));
}
async function op<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try { const r = fn(db.transaction(STORE, mode).objectStore(STORE)); r.onsuccess = () => resolve(r.result); r.onerror = () => resolve(undefined); }
    catch { resolve(undefined); }
  });
}
const get = async <T,>(k: string) => (mem.get(k) as T | undefined) ?? ((await op<T>("readonly", (s) => s.get(k) as IDBRequest<T>)) as T | undefined);
const put = async (k: string, v: Blob | string) => { mem.set(k, v); await op("readwrite", (s) => s.put(v, k)); };
const cardKey = (deck: string, v: number, card: string) => `card:${deck}:${v}:${card}`;

export const getCard = (deck: string, v: number, card: string) => get<Blob>(cardKey(deck, v, card));
export const putCard = (deck: string, v: number, card: string, b: Blob) => put(cardKey(deck, v, card), b);
export const getFont = (id: string) => get<Blob>(`font:${id}`);
export const putFont = (id: string, b: Blob) => put(`font:${id}`, b);
export const isComplete = async (deck: string, v: number) => (await get<string>(`done:${deck}:${v}`)) === "1";
export const markComplete = (deck: string, v: number) => put(`done:${deck}:${v}`, "1");

/** Removes older art versions of a deck after a new version was downloaded. */
export async function prune(deck: string, keep: number) {
  const keys = ((await op<IDBValidKey[]>("readonly", (s) => s.getAllKeys())) ?? []) as string[];
  const stale = keys.filter((k) => (k.startsWith(`card:${deck}:`) || k.startsWith(`done:${deck}:`)) && !k.includes(`:${keep}:`) && !k.endsWith(`:${keep}`));
  await Promise.all(stale.map((k) => { mem.delete(k); return op("readwrite", (s) => s.delete(k)); }));
}

const bitmaps = new Map<string, Promise<ImageBitmap | HTMLImageElement>>();
/** Decoded card image from the device cache (kept in memory for the session). */
export function cardImage(deck: string, v: number, card: string) {
  const k = cardKey(deck, v, card);
  if (!bitmaps.has(k)) {
    bitmaps.set(k, (async () => {
      const b = await getCard(deck, v, card);
      if (!b) throw new Error("Card not downloaded");
      if ("createImageBitmap" in window) return createImageBitmap(b);
      const img = new Image(); img.src = URL.createObjectURL(b); await img.decode(); return img;
    })().catch((e) => { bitmaps.delete(k); throw e; }));
  }
  return bitmaps.get(k)!;
}
