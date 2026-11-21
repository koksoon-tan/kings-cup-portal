import { useEffect, useState } from "react";
import {
  onSnapshot, Query, DocumentReference, DocumentData, FirestoreError,
} from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "./firebase";

export type WithId<T> = T & { id: string };

/** Live query. Pass null to skip. `deps` controls when the query is rebuilt. */
export function useCollection<T = DocumentData>(q: Query | null, deps: unknown[] = []) {
  const [data, setData] = useState<WithId<T>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FirestoreError | null>(null);
  useEffect(() => {
    if (!q) { setData([]); setLoading(false); return; }
    setLoading(true);
    return onSnapshot(q, (snap) => {
      setData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) })));
      setLoading(false);
      setError(null);
    }, (e) => { console.error(e); setError(e); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading, error };
}

export function useDocument<T = DocumentData>(r: DocumentReference | null, deps: unknown[] = []) {
  const [data, setData] = useState<WithId<T> | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!r) { setData(null); setLoading(false); return; }
    setLoading(true);
    return onSnapshot(r, (snap) => {
      setData(snap.exists() ? ({ id: snap.id, ...(snap.data() as T) }) : null);
      setLoading(false);
    }, (e) => { console.error(e); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, loading };
}

const urlCache = new Map<string, Promise<string>>();
export function storageUrl(path: string) {
  if (!urlCache.has(path)) urlCache.set(path, getDownloadURL(ref(storage, path)));
  return urlCache.get(path)!;
}

/** Resolves a Storage path to a download URL. */
export function useStorageUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (path) storageUrl(path).then((u) => alive && setUrl(u)).catch(() => urlCache.delete(path));
    return () => { alive = false; };
  }, [path]);
  return url;
}
