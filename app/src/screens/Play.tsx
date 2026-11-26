import { RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GAME_EFFECTS } from "../../../shared/cards";
import { Deck } from "../lib/decks";
import { cardsLeft, draw, DrawResult, endEarly, finishTurn, Game, skip, undo, upNext } from "../lib/game";
import { sfx } from "../lib/sound";
import { buzz, confetti, keepAwake } from "../lib/fx";
import { setPrefs, usePrefs } from "../lib/prefs";
import { CardFace } from "../components/CardFace";
import { Sheet, toast } from "../components/ui";
import type { Nav } from "../App";

type Panel = null | "menu" | "table" | "how" | "end";

export function Play({ nav, deck, game, setGame }: { nav: Nav; deck: Deck; game: Game; setGame: (g: Game) => void }) {
  const prefs = usePrefs();
  const [reveal, setReveal] = useState<DrawResult | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const stackRef = useRef<HTMLButtonElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const left = cardsLeft(game);
  const p = game.players[game.turn];
  // While a card is being revealed it's already in `drawn`, so the pile shows the one before it.
  const pile = game.drawn[game.drawn.length - (reveal ? 2 : 1)];
  const layers = Math.max(1, Math.min(7, Math.ceil(left / 8)));

  useEffect(() => { keepAwake(true); return () => { keepAwake(false); }; }, []);
  useEffect(() => { if (!reveal) sfx.turn(); }, [game.turn, reveal]);

  const tap = () => {
    if (reveal || panel || game.status !== "playing" || left === 0) return;
    const r = draw(game);
    setGame(r.game);
    setReveal(r);
  };
  const done = (next: Game) => {
    setReveal(null);
    setGame(next);
    if (next.status === "finished") nav("summary");
  };

  return (
    <section className="screen play" onClick={tap}>
      <div className="col" style={{ maxWidth: 720 }}>
        <div className="hud" onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn" onClick={() => setPanel("menu")} aria-label="Pause">⏸</button>
          <div className="left">{left} cards left</div>
          <div className="cupmeter" title="Kings drawn" aria-label={`${game.kings} of 4 Kings drawn`}>🏆 {[0, 1, 2, 3].map((i) => <i key={i} className={i < game.kings ? "f" : ""} />)}</div>
          <button className="icon-btn" onClick={() => setPrefs({ sound: !prefs.sound })} aria-label={prefs.sound ? "Mute" : "Unmute"}>{prefs.sound ? "🔊" : "🔇"}</button>
        </div>
        {game.rules.length > 0 && <div className="rules" aria-label="House rules"><span>📜 {game.rules.map((r) => r.text).join("   ·   📜 ")}</span></div>}
        <div className="turn" key={`${game.turn}-${game.idx}`} style={{ ["--pc" as any]: p.color }}>
          <div className="sub">★ NOW PLAYING ★</div><div className="who">{p.name}'s turn</div>
        </div>
        <div className="table">
          <button ref={stackRef} className={`stack ${left === 1 ? "wobble" : ""}`} aria-label={`Draw a card for ${p.name}`}>
            {Array.from({ length: layers }, (_, i) => (
              <span key={i} className="layer" style={{ transform: `translate(${(layers - 1 - i) * 1.5}px,${(layers - 1 - i) * 2.5}px)`, filter: `brightness(${0.7 + i * 0.05})` }}>
                <CardFace deck={deck} card="BACK" lang={game.lang} text={false} />
              </span>
            ))}
          </button>
          <div className="discard" ref={discardRef} style={{ visibility: pile ? "visible" : "hidden" }}>
            {pile && <CardFace deck={deck} card={pile.card} lang={game.lang} text={false} />}
          </div>
        </div>
        <div className="hint">{left === 1 ? "LAST CARD! TAP TO DRAW" : "TAP ANYWHERE TO DRAW"}</div>
        {game.players.length > 1 && <div className="upnext"><span>Up next:</span>{upNext(game).map((u, i) => <span key={i} className="chip"><i style={{ background: u.color }} />{u.name}</span>)}</div>}
      </div>

      {reveal && <Reveal deck={deck} game={game} r={reveal} stackRef={stackRef} discardRef={discardRef} onDone={done} />}
      {panel && <PauseMenu panel={panel} setPanel={setPanel} game={game} setGame={setGame} nav={nav} />}
    </section>
  );
}

function Reveal({ deck, game, r, stackRef, discardRef, onDone }: {
  deck: Deck; game: Game; r: DrawResult; stackRef: RefObject<HTMLButtonElement | null>; discardRef: RefObject<HTMLDivElement | null>; onDone: (g: Game) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [rule, setRule] = useState("");
  const [mate, setMate] = useState<number | null>(null);
  const p = game.players[r.player];

  useLayoutEffect(() => { // start on top of the deck, then lift to the centre
    const w = wrap.current, s = stackRef.current?.getBoundingClientRect();
    if (!w || !s) return;
    const f = w.getBoundingClientRect();
    w.style.transition = "none";
    w.style.transform = `translate(${s.left + s.width / 2 - (f.left + f.width / 2)}px,${s.top + s.height / 2 - (f.top + f.height / 2)}px) scale(${s.width / f.width})`;
    void w.offsetWidth;
    w.style.transition = "";
    requestAnimationFrame(() => { w.style.transform = "none"; });
    sfx.whoosh();
    const t1 = setTimeout(() => sfx.drum(), 250);
    const t2 = setTimeout(() => { setFlipped(true); sfx.flip(); buzz(35); }, 650);
    const t3 = r.cupOverflow ? setTimeout(() => { setOverflow(true); sfx.king(); buzz([60, 40, 60]); confetti(2500); }, 1500) : undefined;
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const finish = () => {
    if (leaving || !flipped) return;
    setLeaving(true);
    const next = finishTurn(game, { rule, mate });
    const w = wrap.current!, f = w.getBoundingClientRect(), d = discardRef.current?.getBoundingClientRect();
    const tx = d ? d.left + d.width / 2 - (f.left + f.width / 2) : f.width, ty = d ? d.top + d.height / 2 - (f.top + f.height / 2) : f.height;
    w.style.transform = `translate(${tx}px,${ty}px) scale(${d ? d.width / f.width : 0.2}) rotate(9deg)`;
    w.style.opacity = "0.2";
    sfx.whoosh();
    setTimeout(() => onDone(next), 480);
  };

  const others = game.players.map((x, i) => ({ ...x, i })).filter((x) => x.i !== r.player);
  return (
    <div className={`reveal ${leaving ? "leaving" : ""}`} onClick={(e) => { e.stopPropagation(); if (!(e.target as HTMLElement).closest(".effect,.overflow")) finish(); }}>
      <div className="owner">{p.name} drew</div>
      <div className="flipwrap" ref={wrap}>
        <div className={`flipper ${flipped ? "flipped" : ""}`}>
          <div className="face"><CardFace deck={deck} card="BACK" lang={game.lang} text={false} /></div>
          <div className="face front"><CardFace deck={deck} card={r.card} lang={game.lang} /></div>
        </div>
      </div>
      <div className="effect">
        {r.effect === "rule" && <>
          <div className="note">📜 <b>{p.name}</b>, make a rule!</div>
          <input className="field" value={rule} onChange={(e) => setRule(e.currentTarget.value)} placeholder="e.g. No saying 'drink'" maxLength={120} aria-label="New rule" />
        </>}
        {r.effect === "mate" && <>
          <div className="note">🤝 <b>{p.name}</b>, pick your mate:</div>
          <div className="mates">{others.map((o) => <button key={o.i} className="chip" aria-pressed={mate === o.i} onClick={() => { setMate(o.i); sfx.tap(); }}><i style={{ background: o.color }} />{o.name}</button>)}</div>
        </>}
        {r.effect === "master" && <div className="note">👑 <b>{p.name}</b> holds this title until the next one is drawn.</div>}
        {r.effect === "cup" && <div className="note">🏆 King {r.game.kings} of 4.{r.game.kings < 4 && <> <b>{4 - r.game.kings}</b> to go before the cup overflows.</>}</div>}
      </div>
      <button className="btn btn-gold next-btn" disabled={!flipped} onClick={(e) => { e.stopPropagation(); finish(); }}>{r.endsGame ? "See the results ▶" : "Next player ▶"}</button>
      {overflow && (
        <div className="overflow" onClick={(e) => e.stopPropagation()}>
          <div>
            <span className="cup" aria-hidden>🏆</span>
            <h2>The cup overflows!</h2>
            <p style={{ fontSize: 20, margin: "0 0 18px" }}>The 4th King! <b style={{ color: "var(--gold)" }}>{p.name}</b> drinks the King's Cup.</p>
            <p className="muted" style={{ margin: "0 0 16px" }}>{game.endMode === "king4" ? "That's the end of the show." : "The game carries on until the last card."}</p>
            <button className="btn btn-gold" onClick={() => setOverflow(false)}>Bottoms up!</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PauseMenu({ panel, setPanel, game, setGame, nav }: { panel: Panel; setPanel: (p: Panel) => void; game: Game; setGame: (g: Game) => void; nav: Nav }) {
  const close = () => setPanel(null);
  if (panel === "table") {
    const masters = Object.entries(game.masters);
    return (
      <Sheet title="At the table" onClose={close}>
        <p className="label">Titles</p>
        <p>{masters.length ? masters.map(([rank, i]) => <span key={rank}>👑 {game.players[i].name} ({rank === "JOKER" ? "Joker" : rank}){" "}</span>) : <span className="muted">Nobody holds a title yet</span>}</p>
        <p className="label">Mates</p>
        <p>{game.mates.length ? game.mates.map(([a, b], i) => <span key={i}>🤝 {game.players[a].name} &amp; {game.players[b].name}<br /></span>) : <span className="muted">No mates yet</span>}</p>
        <p className="label">House rules</p>
        <p>{game.rules.length ? game.rules.map((r, i) => <span key={i}>📜 {r.text} <span className="muted">({r.by})</span><br /></span>) : <span className="muted">No rules yet</span>}</p>
        <p className="label">Kings drawn</p><p>🏆 {game.kings} of 4</p>
        <button className="btn btn-gold" style={{ width: "100%" }} onClick={close}>Back to the game</button>
      </Sheet>
    );
  }
  if (panel === "how") {
    return (
      <Sheet title="How to play" onClose={close}>
        <p>Put the phone in the middle of the table. The banner shows whose turn it is. That player taps anywhere to draw, reads the card out loud and does what it says.</p>
        <p>Tap <b>Next player</b> to pass the turn. {Object.values(game.effects).includes("cup") && <>Each King fills the cup. {game.endMode === "king4" ? "The 4th King ends the game, and whoever draws it drinks the cup." : "Whoever draws the 4th King drinks the cup, and the game ends when the last card is drawn."}</>}</p>
        <p className="muted">{Object.entries(game.effects).map(([rank, e]) => `${rank === "JOKER" ? "Joker" : rank}: ${GAME_EFFECTS[e!].label}`).join(" · ")}</p>
        <button className="btn btn-gold" style={{ width: "100%" }} onClick={close}>Got it</button>
      </Sheet>
    );
  }
  if (panel === "end") {
    return (
      <Sheet title="End this game?" onClose={close}>
        <p>You'll see the results so far, and the game won't be resumable.</p>
        <div className="menu">
          <button className="btn btn-red" onClick={() => { setGame(endEarly(game)); close(); nav("summary"); }}>End game</button>
          <button className="btn btn-ghost" onClick={close}>Keep playing</button>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet title="Intermission" onClose={close}>
      <div className="menu">
        <button className="btn btn-gold" onClick={close}>▶ Resume</button>
        <button className="btn btn-ghost" disabled={!game.history.length} onClick={() => { setGame(undo(game)); close(); toast("Last card put back on the deck"); }}>↶ Undo last card</button>
        <button className="btn btn-ghost" onClick={() => { const n = game.players[game.turn].name; setGame(skip(game)); close(); toast(`Skipped ${n}`); }}>⏭ Skip {game.players[game.turn].name}</button>
        <button className="btn btn-ghost" onClick={() => setPanel("table")}>🎪 At the table</button>
        <button className="btn btn-ghost" onClick={() => setPanel("how")}>❓ How to play</button>
        <button className="btn btn-ghost" onClick={() => { close(); nav("settings"); }}>⚙︎ Settings</button>
        <button className="btn btn-ghost" style={{ color: "var(--danger)" }} onClick={() => setPanel("end")}>✕ End game</button>
      </div>
    </Sheet>
  );
}
