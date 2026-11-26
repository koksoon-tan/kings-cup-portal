// Demo mode (vite --mode demo): the whole backend runs in the browser with sample data.
import { ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { isSeeded, seedDemo } from "../../../admin/src/demo/seed";
import { resetDemo, store, subscribe } from "../../../admin/src/demo/core";
import { Sheet } from "../components/ui";

export const IS_DEMO = true;

export function DemoGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(isSeeded());
  const [step, setStep] = useState("Starting");
  const [n, setN] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (ready) return;
    seedDemo((s) => { setStep(s); setN((x) => x + 1); }).then(() => setReady(true)).catch((e) => { console.error(e); setError(String(e?.message ?? e)); });
  }, []);
  if (ready) return <>{children}</>;
  return (
    <div className="app"><section className="screen"><div className="col" style={{ justifyContent: "center", gap: 14, textAlign: "center" }}>
      <div style={{ fontSize: 48 }} aria-hidden>🎪</div>
      <h1 className="h-display" style={{ fontSize: 30 }}>Building the demo big top…</h1>
      <p className="muted">Creating a sample circus deck, customers and access codes. This only happens once, on this browser.</p>
      <div className="progress"><i style={{ width: `${Math.min(100, (n / 16) * 100)}%` }} /></div>
      <p style={{ margin: 0 }}>{step}</p>
      {error && <><p className="error">{error}</p><button className="btn btn-gold" onClick={() => resetDemo().then(() => location.reload())}>Reset and retry</button></>}
    </div></section></div>
  );
}

let version = 0;
subscribe(() => { version++; });
const useStore = () => useSyncExternalStore((f) => subscribe(f), () => version);

/** A code that would have been emailed to a buyer and hasn't been used yet. */
function freshCode() {
  const customers = store.list("customers").filter((c) => c.data.codeStatus === "sent" && (c.data.ownedDeckIds ?? []).length);
  for (const c of customers) {
    const code = store.get(`serialCodes/${c.data.currentCodeId}`);
    if (code?.status === "sent") return { code: code.code as string, name: c.data.name as string, email: c.data.email as string };
  }
  return null;
}

export function DemoCodeHint({ onUse }: { onUse: (code: string) => void }) {
  useStore();
  const c = freshCode();
  return (
    <div className="hint-box">
      <b style={{ color: "var(--gold)" }}>Demo:</b>{" "}
      {c ? <>{c.name}'s unused code is <code>{c.code}</code>. <button className="link" style={{ fontSize: 16, padding: 0 }} onClick={() => onUse(c.code)}>Use it</button>. Enter it twice to see the "already used" message.</>
        : <>All sample codes are used. Tap "Lost your code" and use a sample buyer's email such as <code>hana@mail.demo</code>.</>}
    </div>
  );
}

export function DemoMailPreview({ email, onUse }: { email: string; onUse: (code: string) => void }) {
  useStore();
  const mail = store.list("mail").filter((m) => m.data.to === email).sort((a, b) => (b.data.createdAt?.toMillis?.() ?? 0) - (a.data.createdAt?.toMillis?.() ?? 0))[0];
  const code = mail?.data.message?.html?.match(/KC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/)?.[0];
  const buyers = store.list("customers").map((c) => c.data.email).filter(Boolean).slice(0, 4);
  return (
    <div style={{ marginTop: 18 }}>
      <p className="label" style={{ margin: "0 0 8px" }}>Demo: the email that was sent</p>
      {mail && code ? (
        <>
          <div className="mail">
            <div style={{ color: "#666", fontSize: 13 }}>To: {email}</div>
            <b>{mail.data.message.subject}</b>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: ".12em", margin: "8px 0", color: "#1d1838" }}>{code}</div>
            <div style={{ color: "#666" }}>Your old unused code no longer works.</div>
          </div>
          <button className="btn btn-gold" style={{ width: "100%", marginTop: 12 }} onClick={() => onUse(code)}>Enter this code</button>
        </>
      ) : (
        <div className="hint-box">No email was sent, because no sample buyer uses <b>{email}</b>. Try one of: {buyers.map((b) => <code key={b}>{b} </code>)}</div>
      )}
    </div>
  );
}

export function DemoBadge() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} style={{ position: "fixed", zIndex: 80, left: "max(8px, env(safe-area-inset-left, 0px))", bottom: "calc(6px + env(safe-area-inset-bottom, 0px))", background: "rgba(13,11,28,.75)", border: "1px solid var(--gold-dk)", color: "var(--gold)", borderRadius: 999, padding: "3px 10px", fontSize: 13, letterSpacing: ".08em" }}>DEMO</button>
      {open && (
        <Sheet title="Demo mode" onClose={() => { setOpen(false); setConfirm(false); }}>
          <p>This is the real player app, running entirely in your browser with sample data: one circus deck, sample buyers and their access codes. No real emails are sent.</p>
          <p className="muted">Everything you do is saved in this browser only.</p>
          {!confirm
            ? <button className="btn btn-ghost" style={{ width: "100%" }} onClick={() => setConfirm(true)}>Reset the demo…</button>
            : <div className="menu"><p style={{ margin: 0 }}>This signs you out and rebuilds the sample data.</p>
                <button className="btn btn-red" onClick={() => { try { localStorage.clear(); } catch { /* blocked */ } resetDemo().then(() => { location.hash = ""; location.reload(); }); }}>Reset demo</button></div>}
          <button className="btn btn-gold" style={{ width: "100%", marginTop: 10 }} onClick={() => setOpen(false)}>Back to the show</button>
        </Sheet>
      )}
    </>
  );
}
