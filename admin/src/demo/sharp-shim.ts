// Browser stand-in for the parts of "sharp" used by functions/src/decks.ts.
import { Buffer } from "buffer";
const bitmap = (input: Uint8Array) => createImageBitmap(new Blob([input as BlobPart]));
export default function sharp(input: Uint8Array) {
  return {
    async metadata() { const b = await bitmap(input); return { width: b.width, height: b.height, density: 0 }; },
    resize({ width }: { width: number }) {
      return {
        webp(opts?: { quality?: number }) {
          return {
            async toBuffer() {
              const b = await bitmap(input);
              const h = Math.round((b.height / b.width) * width);
              const c = new OffscreenCanvas(width, h);
              c.getContext("2d")!.drawImage(b, 0, 0, width, h);
              const blob = await c.convertToBlob({ type: "image/webp", quality: (opts?.quality ?? 85) / 100 });
              return Buffer.from(await blob.arrayBuffer());
            },
          };
        },
      };
    },
  };
}
