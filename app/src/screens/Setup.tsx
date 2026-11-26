import { useState } from "react";
import { LANGUAGES } from "../../../shared/cards";
import { LibraryDeck, effectsOf } from "../lib/decks";
import { createGame, EndMode, Game, MAX_PLAYERS, MIN_PLAYERS, PLAYER_COLORS } from "../lib/game";
import { getPrefs, setPrefs } from "../lib/prefs";
import { sfx } from "../lib/sound";
import { Switch, TopBar } from "../components/ui";
import type { Nav } from "../App";

const NAMES_KEY = "kc-play-names", OPTS_KEY = "kc-play-setup";
const load = <T,>(k: string, d: T): T => { try { return { ...d, ...JSON.parse(localStorage.getItem(k) ?? "null") }; } catch { return d; } };
const loadNames = (): string[] => { try { const v = JSON.parse(localStorage.getItem(NAMES_KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const store = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked */ } };

export function Setup({ nav, deck, onStart, presetNames }: { nav: Nav; deck: LibraryDeck; onStart: (g: Game) => void; presetNames?: string[] }) {
  const saved = load(OPTS_KEY, { count: 4, jokers: true, endMode: "last" as EndMode });
  const [count, setCount] = useState<number>(presetNames?.length ?? saved.count);
  const [names, setNames] = useState<string[]>(() => { const n = presetNames ?? loadNames(); return [...n, ...Array(MAX_PLAYERS).fill("")].slice(0, MAX_PLAYERS); });
  const langs = deck.languages?.length ? deck.languages : [deck.defaultLanguage ?? "en"];
  const [lang, setLang] = useState(() => { const p = getPrefs().lang; return p && langs.includes(p) ? p : deck.defaultLanguage ?? langs[0]; });
  const [jokers, setJokers] = useState<boolean>(saved.jokers);
  const [endMode, setEndMode] = useState<EndMode>(saved.endMode);

  const move = (i: number, j: number) => { const n = [...names]; [n[i], n[j]] = [n[j], n[i]]; setNames(n); sfx.tap(); };
  const start = () => {
    const list = names.slice(0, count);
    store(NAMES_KEY, names.filter((_, i) => i < count)); store(OPTS_KEY, { count, jokers, endMode }); setPrefs({ lang });
    sfx.fanfare();
    onStart(createGame({ deckId: deck.id, artVersion: deck.artVersion ?? 0, lang, names: list, jokers, endMode: hasCup ? endMode : "last", effects: effectsOf(deck), available: deck.available }));
  };
  const cupCards = deck.available.filter((k) => effectsOf(deck)[k.startsWith("JK") ? "JOKER" : k.slice(0, -1)] === "cup").length;
  const hasCup = cupCards >= 4;
  const deckSize = deck.available.filter((k) => jokers || !k.startsWith("JK")).length;
  const hasJokers = deck.available.some((k) => k.startsWith("JK"));

  return (
    <section className="screen">
      <div className="col">
        <TopBar onBack={() => nav("library")} title="Game setup" />
        <h1 className="h-display" style={{ fontSize: 30, textAlign: "center", marginTop: 6 }}>{deck.name}</h1>
        <p className="label" style={{ textAlign: "center", margin: "14px 0 0" }}>How many players?</p>
        <div className="stepper">
          <button onClick={() => { setCount(Math.max(MIN_PLAYERS, count - 1)); sfx.tap(); }} disabled={count <= MIN_PLAYERS} aria-label="Fewer players">−</button>
          <output aria-live="polite">{count}</output>
          <button onClick={() => { setCount(Math.min(MAX_PLAYERS, count + 1)); sfx.tap(); }} disabled={count >= MAX_PLAYERS} aria-label="More players">+</button>
        </div>
        <p className="muted" style={{ textAlign: "center", margin: "0 0 6px", fontSize: 15 }}>Names are optional. This is the turn order.</p>
        <div className="names">
          {Array.from({ length: count }, (_, i) => (
            <div className="name-row" key={i}>
              <span className="dot" style={{ background: PLAYER_COLORS[i % PLAYER_COLORS.length] }}>{i + 1}</span>
              <input className="field" value={names[i]} placeholder={`Player ${i + 1}`} maxLength={16} aria-label={`Player ${i + 1} name`}
                onChange={(e) => { const n = [...names]; n[i] = e.currentTarget.value; setNames(n); }} />
              <button className="mv" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move player ${i + 1} up`}>▲</button>
              <button className="mv" onClick={() => move(i, i + 1)} disabled={i === count - 1} aria-label={`Move player ${i + 1} down`}>▼</button>
            </div>
          ))}
        </div>
        <div className="panel" style={{ marginTop: 16 }}>
          {langs.length > 1 && (
            <div className="opt"><div><div className="t">Language</div><div className="d">Card text language</div></div>
              <select className="field" value={lang} onChange={(e) => setLang(e.currentTarget.value)} aria-label="Language">
                {langs.map((l) => <option key={l} value={l}>{LANGUAGES[l] ?? l}</option>)}
              </select></div>
          )}
          {hasJokers && (
            <div className="opt"><div><div className="t">Include jokers</div><div className="d">{deckSize} cards in the deck</div></div>
              <Switch checked={jokers} onChange={(v) => { setJokers(v); sfx.tap(); }} label="Include jokers" /></div>
          )}
          {hasCup && (
            <div className="opt" style={{ display: "block" }}><div className="t">The game ends…</div>
              <div className="seg">
                <button aria-pressed={endMode === "last"} onClick={() => { setEndMode("last"); sfx.tap(); }}>When the last<br />card is drawn</button>
                <button aria-pressed={endMode === "king4"} onClick={() => { setEndMode("king4"); sfx.tap(); }}>When the<br />4th King is drawn</button>
              </div></div>
          )}
        </div>
        <button className="btn btn-gold marquee" style={{ marginTop: 18 }} onClick={start}>★ Start the show ★</button>
      </div>
    </section>
  );
}
