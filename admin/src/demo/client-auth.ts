// Stand-in for "firebase/auth".
import { users, session, authBus } from "./core";

export interface User { uid: string; email: string | null; displayName?: string; getIdTokenResult(): Promise<{ claims: Record<string, any> }>; getIdToken(): Promise<string> }
const auth: { currentUser: User | null } = { currentUser: null };

function toUser(uid: string | null): User | null {
  const u = uid ? users[uid] : null;
  if (!u || u.disabled) return null;
  return {
    uid: u.uid, email: u.email, displayName: u.displayName,
    getIdTokenResult: async () => ({ claims: { ...users[u.uid]?.claims, email: u.email } }),
    getIdToken: async () => `demo-${u.uid}`,
  };
}
const refresh = () => { auth.currentUser = toUser(session.uid); };
refresh();
authBus.subscribe(refresh);

export const getAuth = (_app?: unknown) => auth;
export const connectAuthEmulator = () => undefined;
export function onIdTokenChanged(_a: unknown, cb: (u: User | null) => void) {
  setTimeout(() => cb(auth.currentUser), 0);
  return authBus.subscribe(() => cb(auth.currentUser));
}
export const onAuthStateChanged = onIdTokenChanged;
export async function signInWithEmailAndPassword(_a: unknown, email: string, password: string) {
  await new Promise((r) => setTimeout(r, 250));
  const u = Object.values(users).find((x) => x.email === email.trim().toLowerCase());
  if (!u || u.password !== password || u.disabled) throw Object.assign(new Error("auth/invalid-credential"), { code: "auth/invalid-credential" });
  session.uid = u.uid;
  authBus.emit();
  return { user: auth.currentUser };
}
/** Demo stand-in for custom-token sign-in (tokens come from the demo createCustomToken). */
export async function signInWithCustomToken(_a: unknown, token: string) {
  await new Promise((r) => setTimeout(r, 150));
  const uid = token.split(".")[1];
  if (!uid || !users[uid] || users[uid].disabled) throw Object.assign(new Error("auth/invalid-custom-token"), { code: "auth/invalid-custom-token" });
  session.uid = uid;
  authBus.emit();
  return { user: auth.currentUser };
}
export async function signOut() { session.uid = null; authBus.emit(); }
export async function sendPasswordResetEmail() { /* demo: nothing to send */ }
