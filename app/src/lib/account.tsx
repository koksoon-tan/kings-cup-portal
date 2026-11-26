import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { onIdTokenChanged, signInWithCustomToken, signOut as fbSignOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "./firebase";

export interface Customer { id: string; name?: string; email?: string; banned?: boolean; ownedDeckIds?: string[] }
interface Account { loading: boolean; customerId: string | null; customer: Customer | null }
const Ctx = createContext<Account>({ loading: true, customerId: null, customer: null });

export function AccountProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Account>({ loading: true, customerId: null, customer: null });
  useEffect(() => {
    let unsubDoc: (() => void) | null = null;
    const unsub = onIdTokenChanged(auth, async (user) => {
      unsubDoc?.(); unsubDoc = null;
      if (!user) return setState({ loading: false, customerId: null, customer: null });
      const claims = (await user.getIdTokenResult()).claims;
      const customerId = (claims.customerId as string) || null;
      if (!customerId) return setState({ loading: false, customerId: null, customer: null });
      unsubDoc = onSnapshot(doc(db, "customers", customerId),
        (snap) => setState({ loading: false, customerId, customer: snap.exists() ? ({ id: snap.id, ...snap.data() } as Customer) : { id: customerId } }),
        () => setState({ loading: false, customerId, customer: { id: customerId } }));
    });
    return () => { unsub(); unsubDoc?.(); };
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
export const useAccount = () => useContext(Ctx);

export function normaliseCode(input: string) {
  let v = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (v.startsWith("KC")) v = v.slice(2);
  v = v.slice(0, 12);
  return v ? "KC-" + v.match(/.{1,4}/g)!.join("-") : "";
}

function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Web";
  return `${os} · ${/Mobile/.test(ua) ? "phone" : "browser"}`;
}

/** Redeems a one-time code and signs in. Throws with a player-friendly message. */
export async function redeem(code: string) {
  try {
    const res = await httpsCallable<{ code: string; device: string }, { token: string }>(functions, "redeemSerialCode")({ code, device: deviceLabel() });
    await signInWithCustomToken(auth, res.data.token);
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (/already been used/i.test(msg)) throw new Error("This code has already been used. Get a new one with your email below.");
    if (/expired/i.test(msg)) throw new Error("This code has expired. Get a new one with your email below.");
    if (/blocked/i.test(msg)) throw new Error("This account has been blocked. Contact support.");
    if (/too many/i.test(msg)) throw new Error("Too many tries. Wait a while and try again.");
    if (/invalid|not.?found|no longer valid/i.test(msg)) throw new Error("We couldn't find that code. Check it against your email.");
    throw new Error("Couldn't check the code. Check your connection and try again.");
  }
}

export async function requestNewCode(email: string) {
  try {
    await httpsCallable(functions, "requestAccessCode")({ email });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (/valid email/i.test(msg)) throw new Error("Enter a valid email address.");
    if (/too many/i.test(msg)) throw new Error("Too many requests. Try again in an hour.");
    throw new Error("Couldn't send the email. Check your connection and try again.");
  }
}

export const signOut = () => fbSignOut(auth);
