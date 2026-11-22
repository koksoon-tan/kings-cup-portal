// Stand-in for "firebase-admin/storage".
import { Buffer } from "buffer";
import { files } from "./core";

const bucket = {
  file(path: string) {
    return {
      async save(data: Uint8Array, opts?: { contentType?: string }) { await files.put(path, data, opts?.contentType); },
      async download() {
        const b = await files.get(path);
        if (!b) throw new Error(`No such object: ${path}`);
        return [Buffer.from(await b.arrayBuffer())];
      },
    };
  },
};
export const getStorage = (_app?: unknown) => ({ bucket: (_name?: string) => bucket });
