import { Buffer } from "buffer";
(globalThis as any).Buffer ??= Buffer;
(globalThis as any).process ??= { env: {}, browser: true, nextTick: (f: any, ...a: any[]) => setTimeout(() => f(...a), 0) };
