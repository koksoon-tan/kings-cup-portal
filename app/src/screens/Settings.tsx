import { useState } from "react";
import { LANGUAGES } from "../../../shared/cards";
import { setPrefs, usePrefs } from "../lib/prefs";
import { signOut, useAccount } from "../lib/account";
import { saveGame } from "../lib/game";
import { sfx } from "../lib/sound";
import { Sheet, Switch, TopBar, toast } from "../components/ui";

export function Settings({ onBack }: { onBack: () => void }) {
  const prefs = usePrefs();
  const { customer } = useAccount();
  const [confirm, setConfirm] = useState(false);
  const email = customer?.email ? customer.email.replace(/^(.).*(@.*)$/, "$1•••$2") : null;
  const row = (k: "sound" | "vibrate" | "reduceMotion", t: string, d: string) => (
    <div className="opt"><div><div className="t">{t}</div><div className="d">{d}</div></div>
      <Switch checked={prefs[k]} label={t} onChange={(v) => { setPrefs({ [k]: v }); sfx.tap(); }} /></div>
  );
  return (
    <section className="screen">
      <div className="col">
        <TopBar onBack={onBack} title="Settings" />
        <div className="panel" style={{ marginTop: 14 }}>
          {row("sound", "Sound effects", "Drumrolls, flips and fanfares")}
          {row("vibrate", "Vibration", "A buzz when a card flips (Android)")}
          {row("reduceMotion", "Reduce motion", "Simple fades instead of flips and confetti")}
          <div className="opt"><div><div className="t">Card language</div><div className="d">Used when a deck has it</div></div>
            <select className="field" value={prefs.lang ?? ""} onChange={(e) => setPrefs({ lang: e.currentTarget.value || null })} aria-label="Card language">
              <option value="">Deck default</option>
              {Object.entries(LANGUAGES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
        </div>
        <p className="label" style={{ margin: "22px 0 8px" }}>Account</p>
        <div className="panel" style={{ padding: 14 }}>
          <div>{email ? <>Signed in as <b>{email}</b></> : "Signed in"}</div>
          <div className="muted" style={{ fontSize: 15, marginTop: 4 }}>You stay signed in on this device. Your decks follow you to any device where you enter a code.</div>
          <button className="btn btn-ghost" style={{ width: "100%", marginTop: 12 }} onClick={() => setConfirm(true)}>Sign out of this device</button>
        </div>
        <p className="muted" style={{ fontSize: 14, textAlign: "center", marginTop: "auto", paddingTop: 20 }}>Kings Cup · For players 18+ · Please drink responsibly</p>
      </div>
      {confirm && (
        <Sheet title="Sign out?" onClose={() => setConfirm(false)}>
          <p>Your code has already been used, so you'll need a <b>new code</b> from your email to sign back in on this device.</p>
          <div className="menu">
            <button className="btn btn-red" onClick={async () => { saveGame(null); await signOut(); toast("Signed out"); }}>Sign out</button>
            <button className="btn btn-ghost" onClick={() => setConfirm(false)}>Stay signed in</button>
          </div>
        </Sheet>
      )}
    </section>
  );
}
