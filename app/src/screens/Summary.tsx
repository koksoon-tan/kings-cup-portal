import { useEffect, useState } from "react";
import { Game, summarize } from "../lib/game";
import { confetti } from "../lib/fx";
import { sfx } from "../lib/sound";

export function Summary({ game, onAgain, onChangePlayers, onDecks }: { game: Game; onAgain: () => void; onChangePlayers: () => void; onDecks: () => void }) {
  const s = summarize(game);
  const max = Math.max(1, ...s.perPlayer.map((x) => x.cards));
  const [grow, setGrow] = useState(false);
  useEffect(() => { confetti(4500); sfx.fanfare(); requestAnimationFrame(() => setGrow(true)); }, []);
  const ended = game.endedBy === "king4" && s.cupDrinker ? `${s.cupDrinker} drew the 4th King and drinks the cup!`
    : game.idx >= game.order.length ? "Every card has been drawn." : "The show ended early.";
  return (
    <section className="screen summary">
      <div className="col">
        <div style={{ fontSize: 54, marginTop: 6 }} aria-hidden>🎪</div>
        <h1 className="h-display" style={{ fontSize: 42 }}>That's the show!</h1>
        <p className="muted" style={{ margin: 0 }}>{ended}</p>
        <div className="stat-row">
          <div className="stat"><b>{s.total}</b><span>cards drawn</span></div>
          <div className="stat"><b>{s.cupDrawers.length}</b><span>Kings</span></div>
          <div className="stat"><b>{s.rules.length}</b><span>rules made</span></div>
        </div>
        {s.cupDrinker && <div className="panel" style={{ padding: 12 }}><span className="label">King's Cup drinker</span><div className="h-display" style={{ fontSize: 28 }}>🏆 {s.cupDrinker}</div></div>}
        <div className="panel" style={{ padding: 12 }}>
          <p className="label" style={{ margin: "0 0 8px", textAlign: "left" }}>Cards drawn</p>
          <div className="bars">{s.perPlayer.map((x, i) => (
            <div className="bar" key={i}><span className="nm">{x.player.name}</span>
              <span className="tr"><i style={{ width: grow ? `${(x.cards / max) * 100}%` : 0, background: x.player.color }} /></span><b>{x.cards}</b></div>
          ))}</div>
        </div>
        {s.rules.length > 0 && <div className="panel" style={{ padding: 12, textAlign: "left" }}>
          <p className="label" style={{ margin: "0 0 6px" }}>House rules made</p>
          {s.rules.map((r, i) => <div key={i}>📜 {r.text} <span className="muted">({r.by})</span></div>)}
        </div>}
        <button className="btn btn-gold marquee" onClick={onAgain}>Play again</button>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button className="btn btn-ghost" onClick={onChangePlayers}>Change players</button>
          <button className="btn btn-ghost" onClick={onDecks}>Back to decks</button>
        </div>
      </div>
    </section>
  );
}
