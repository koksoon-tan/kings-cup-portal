import { Buffer } from "buffer";
// Demo mode bundles the backend code, which expects Node's Buffer/process. No-op otherwise.
if (import.meta.env.MODE === "demo") {
  (globalThis as any).Buffer ??= Buffer;
  (globalThis as any).process ??= { env: {}, browser: true, nextTick: (f: any, ...a: any[]) => setTimeout(() => f(...a), 0) };
}
