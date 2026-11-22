// Stand-in for "firebase-admin/auth".
import { users, session, authBus, saveUsers } from "./core";

const err = (code: string, message: string) => Object.assign(new Error(message), { code });
const pub = (u: any) => ({ uid: u.uid, email: u.email, displayName: u.displayName, disabled: !!u.disabled, customClaims: u.claims });

const auth = {
  async createUser(p: { uid?: string; email?: string; password?: string; displayName?: string }) {
    const email = p.email?.toLowerCase();
    if (email && Object.values(users).some((u) => u.email === email)) throw err("auth/email-already-exists", "Email already exists");
    const uid = p.uid ?? Math.random().toString(36).slice(2, 14);
    if (users[uid]) throw err("auth/uid-already-exists", "uid exists");
    users[uid] = { uid, email: email ?? "", password: p.password, displayName: p.displayName, claims: {} };
    saveUsers();
    return pub(users[uid]);
  },
  async getUser(uid: string) { if (!users[uid]) throw err("auth/user-not-found", "No user"); return pub(users[uid]); },
  async getUserByEmail(email: string) {
    const u = Object.values(users).find((x) => x.email === email.toLowerCase());
    if (!u) throw err("auth/user-not-found", "No user");
    return pub(u);
  },
  async setCustomUserClaims(uid: string, claims: Record<string, any> | null) { users[uid].claims = { ...(claims ?? {}) }; authBus.emit(); },
  async updateUser(uid: string, p: { disabled?: boolean; displayName?: string; password?: string }) {
    Object.assign(users[uid], p);
    authBus.emit();
    return pub(users[uid]);
  },
  async revokeRefreshTokens(uid: string) { if (session.uid === uid && users[uid]?.disabled) { session.uid = null; authBus.emit(); } },
  async createCustomToken(uid: string, claims?: Record<string, any>) { return `demo-custom-token.${uid}.${btoa(JSON.stringify(claims ?? {}))}`; },
};
export const getAuth = (_app?: unknown) => auth;
