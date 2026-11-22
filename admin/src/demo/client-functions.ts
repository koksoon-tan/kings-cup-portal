// Stand-in for "firebase/functions": runs the real handlers from functions/src in the browser.
import { users, session } from "./core";

export const getFunctions = (_app?: unknown, _region?: string) => ({ __functions: true });
export const connectFunctionsEmulator = () => undefined;

let mod: Promise<Record<string, any>> | null = null;
const load = () => (mod ??= import("../../../functions/src/index"));

export async function invoke(name: string, data: unknown, asUid: string | null = session.uid) {
  const handlers = await load();
  const h = handlers[name];
  if (!h?.__callable) throw new Error(`Unknown function ${name}`);
  const u = asUid ? users[asUid] : null;
  const req = {
    data: JSON.parse(JSON.stringify(data ?? null)),
    auth: u && !u.disabled ? { uid: u.uid, token: { ...u.claims, email: u.email } } : undefined,
    rawRequest: { ip: "demo-browser" },
  };
  await new Promise((r) => setTimeout(r, 120));
  const res = await h(req);
  return JSON.parse(JSON.stringify(res ?? null));
}

export function httpsCallable(_f: unknown, name: string, _opts?: unknown) {
  return async (data?: unknown) => ({ data: await invoke(name, data) });
}
