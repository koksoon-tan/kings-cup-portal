import { FormEvent, useEffect, useRef, useState } from "react";
import { normaliseCode, redeem, requestNewCode, signOut } from "../lib/account";
import { sfx } from "../lib/sound";
import { buzz, confetti } from "../lib/fx";
import { TopBar } from "../components/ui";
import { DemoCodeHint, DemoMailPreview } from "@demo";
import type { Nav } from "../App";

export function Splash({ nav, signedIn }: { nav: Nav; signedIn: boolean }) {
  return (
    <section className="screen splash">
      <div className="tent" /><div className="glow" />
      <div className="valance" /><div className="curtain" /><div className="curtain r" />
      <div className="sign"><div className="crown" aria-hidden>👑</div><h1>KINGS<br />CUP</h1><p>THE BIG TOP PARTY GAME</p></div>
      <button className="btn btn-gold marquee over" style={{ minWidth: 240 }} onClick={() => { sfx.ok(); nav(signedIn ? "library" : "login"); }}>
        {signedIn ? "Continue" : "Enter the Big Top"}
      </button>
      <p className="muted over" style={{ margin: 0, fontSize: 16 }}>{signedIn ? "You're signed in on this device." : "Have your access code ready."}</p>
      <p className="muted over" style={{ margin: 0, fontSize: 13, opacity: .7 }}>For players 18+. Please drink responsibly.</p>
    </section>
  );
}

export function Login({ nav, initialCode = "", signedIn }: { nav: Nav; initialCode?: string; signedIn: boolean }) {
  const [code, setCode] = useState(initialCode);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [punched, setPunched] = useState(false);
  const ticket = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Already signed in (e.g. came back with the browser's back button): skip ahead.
  useEffect(() => { if (signedIn && !punched) nav("library"); }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const fail = (text: string) => {
    setMsg({ ok: false, text }); sfx.error(); buzz(120);
    const t = ticket.current; if (t) { t.classList.remove("shake"); void t.offsetWidth; t.classList.add("shake"); }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length < 17) return fail("Enter all 12 letters and numbers.");
    setBusy(true); setMsg(null);
    try {
      await redeem(code);
      setPunched(true); setMsg({ ok: true, text: "Welcome to the show! You're signed in for good on this device." });
      sfx.ok(); buzz(40); confetti(2200);
      timer.current = setTimeout(() => nav("library"), 1500);
    } catch (err: any) { fail(err.message); }
    finally { setBusy(false); }
  };

  return (
    <section className="screen">
      <div className="col" style={{ justifyContent: "center" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 40 }} aria-hidden>🎟️</div>
          <h1 className="h-display" style={{ fontSize: 34 }}>Your ticket in</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>Enter the code from your email. It works once, then you stay signed in on this device.</p>
        </div>
        <form ref={ticket} className={`ticket ${punched ? "punched" : ""}`} onSubmit={submit} autoComplete="off">
          <h2>Access code</h2>
          <p>Found in the email you got after your purchase.</p>
          <div className="stub" />
          <input className="code-input" id="code" inputMode="text" maxLength={17} placeholder="KC-XXXX-XXXX-XXXX" aria-label="Access code"
            autoCapitalize="characters" spellCheck={false} value={code} onChange={(e) => setCode(normaliseCode(e.currentTarget.value))} />
          <div className={`msg ${msg ? (msg.ok ? "ok" : "err") : ""}`} role="status">{msg?.text}</div>
          <button className="btn btn-red" style={{ width: "100%", marginTop: 6 }} type="submit" disabled={busy || punched}>{busy ? "Checking…" : "Let me in"}</button>
        </form>
        <button className="link" style={{ marginTop: 12 }} onClick={() => nav("lost")}>Lost your code or using a new phone?</button>
        <DemoCodeHint onUse={(c) => setCode(c)} />
      </div>
    </section>
  );
}

export function LostCode({ nav, onUseCode }: { nav: Nav; onUseCode: (code: string) => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await requestNewCode(email.trim().toLowerCase()); setSent(email.trim().toLowerCase()); sfx.ok(); }
    catch (x: any) { setErr(x.message); sfx.error(); }
    finally { setBusy(false); }
  };
  return (
    <section className="screen">
      <div className="col">
        <TopBar onBack={() => nav("login")} title="New code" />
        <div style={{ marginTop: 20 }}>
          <h1 className="h-display" style={{ fontSize: 32 }}>Lost your ticket?</h1>
          <p className="muted">Enter the email you used when you bought your deck. We'll send a new one-time code, and any unused old code stops working.</p>
        </div>
        {!sent ? (
          <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 6 }}>
            <label className="label" htmlFor="em">Email</label>
            <input className="field" id="em" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
            {err && <div className="error" role="alert">{err}</div>}
            <button className="btn btn-gold" type="submit" disabled={busy}>{busy ? "Sending…" : "Send me a new code"}</button>
          </form>
        ) : (
          <>
            <div className="panel" style={{ marginTop: 16, padding: 14 }}>
              <b style={{ color: "var(--gold)" }}>Check your inbox.</b>
              <p style={{ margin: "6px 0 0" }}>If <b>{sent}</b> has a purchase, a new code is on its way. Didn't get it? Check spam, or try again in a few minutes.</p>
            </div>
            <DemoMailPreview email={sent} onUse={onUseCode} />
            <button className="btn btn-gold" style={{ marginTop: 16 }} onClick={() => nav("login")}>I've got my code</button>
          </>
        )}
      </div>
    </section>
  );
}

export function Blocked() {
  return (
    <section className="screen">
      <div className="col" style={{ justifyContent: "center", textAlign: "center", gap: 14 }}>
        <div style={{ fontSize: 54 }} aria-hidden>🚫</div>
        <h1 className="h-display" style={{ fontSize: 32 }}>Account blocked</h1>
        <p className="muted">This account can't play right now. If you think this is a mistake, contact Kings Cup support with the email you bought your deck with.</p>
        <button className="btn btn-ghost" onClick={() => signOut()}>Sign out</button>
      </div>
    </section>
  );
}
