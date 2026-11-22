// Stand-in for "firebase/storage".
import { files } from "./core";

export const getStorage = (_app?: unknown) => ({ __storage: true });
export const connectStorageEmulator = () => undefined;
export const ref = (_s: unknown, path: string) => ({ fullPath: path });
export const getDownloadURL = (r: { fullPath: string }) => files.url(r.fullPath);
export async function getBlob(r: { fullPath: string }) { const b = await files.get(r.fullPath); if (!b) throw new Error("Not found"); return b; }
export async function uploadBytes(r: { fullPath: string }, data: Blob | Uint8Array, meta?: { contentType?: string }) {
  await files.put(r.fullPath, data, meta?.contentType ?? (data as Blob).type);
  void files.finalize(r.fullPath);
  return { ref: r };
}

/** Upload task with simulated progress; also awaitable like the real UploadTask. */
export function uploadBytesResumable(r: { fullPath: string }, data: Blob | Uint8Array, meta?: { contentType?: string }) {
  const total = (data as Blob).size ?? (data as Uint8Array).byteLength ?? 1;
  let onProgress: any, onError: any, onDone: any;
  const done = (async () => {
    for (const p of [0.25, 0.6, 0.9]) {
      await new Promise((res) => setTimeout(res, 150));
      onProgress?.({ bytesTransferred: Math.round(total * p), totalBytes: total });
    }
    await files.put(r.fullPath, data, meta?.contentType ?? (data as Blob).type);
    onProgress?.({ bytesTransferred: total, totalBytes: total });
    onDone?.();
    void files.finalize(r.fullPath);
    return { ref: r };
  })().catch((e) => { onError?.(e); throw e; });
  return {
    on(_ev: string, p: any, e: any, d: any) { onProgress = p; onError = e; onDone = d; },
    then: (a: any, b: any) => done.then(a, b),
    catch: (b: any) => done.catch(b),
  };
}
