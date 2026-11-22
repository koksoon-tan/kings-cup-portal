// Stand-in for "firebase-functions/v2/https".
export class HttpsError extends Error {
  constructor(public code: string, message: string, public details?: unknown) { super(message); this.name = "FirebaseError"; }
}
export type CallableRequest<T = any> = { data: T; auth?: { uid: string; token: Record<string, any> }; rawRequest: { ip?: string } };
export function onCall(optsOrHandler: any, maybeHandler?: any) {
  const handler = typeof optsOrHandler === "function" ? optsOrHandler : maybeHandler;
  const fn = (req: CallableRequest) => handler(req);
  (fn as any).__callable = true;
  return fn;
}
