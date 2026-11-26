import { useEffect, useState } from "react";
import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "../lib/firebase";
import { LibraryDeck, downloadDeck } from "../lib/decks";
import { cardImage, isComplete } from "../lib/deckCache";
import { sfx } from "../lib/sound";
import { Sheet } from "../components/ui";
import { cardsLeft, Game } from "../lib/game";
import type { Nav } from "../App";

function Cover({ deck }: { deck: LibraryDeck }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true, url: string | null = null;
    const v = deck.artVersion ?? 0;
    (async () => {
      if (!deck.cards?.AS) return;
      try { // prefer the copy saved on this device (works offline)
        const img = await cardImage(deck.id, v, "AS");
        const c = document.createElement("canvas"); c.width = (img as ImageBitmap).width; c.height = (img as ImageBitmap).height;
        c.getContext("2d")!.drawImage(img, 0, 0);
        url = c.toDataURL("image/webp", .8);
      } catch {
        try { url = await getDownloadURL(ref(storage, deck.cards.AS.previewPath)); } catch { url = null; }
      }
      if (alive) setSrc(url);
    })();
    return () => { alive = false; };
  }, [deck.id, deck.artVersion]);
  return src ? <img src={src} alt="" /> : <span className="placeholder" aria-hidden>🎪</span>;
}

export function Library({ nav, decks, error, game, onPick }: {
  nav: Nav; decks: LibraryDeck[] | null; error: string | null; game: Game | null; onPick: (d: LibraryDeck) => void;
}) {
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const [download, setDownload] = useState<{ deck: LibraryDeck; done: number; total: number; error?: string } | null>(null);
  const [locked, setLocked] = useState<LibraryDeck | null>(null);

  useEffect(() => {
    (decks ?? []).forEach((d) => isComplete(d.id, d.artVersion ?? 0).then((ok) => ok && setReady((r) => ({ ...r, [d.id]: true }))));
  }, [decks?.map((d) => `${d.id}:${d.artVersion}`).join()]);

  const open = async (d: LibraryDeck) => {
    sfx.tap();
    if (!d.owned) return setLocked(d);
    if (!d.playable) return setLocked(d);
    setDownload({ deck: d, done: 0, total: 55 });
    try {
      await downloadDeck(d, (done, total) => setDownload({ deck: d, done, total }));
      setReady((r) => ({ ...r, [d.id]: true }));
      sfx.ok();
      setTimeout(() => { setDownload(null); onPick(d); }, 300);
    } catch {
      setDownload({ deck: d, done: 0, total: 55, error: "Couldn't download the cards. Check your connection and try again." });
    }
  };
  const resumable = game && game.status === "playing" && decks?.some((d) => d.id === game.deckId && d.playable);
  const owned = (decks ?? []).filter((d) => d.owned), others = (decks ?? []).filter((d) => !d.owned);

  return (
    <section className="screen">
      <div className="col">
        <div className="topbar"><span className="h-display" style={{ fontSize: 26 }}>👑 Kings Cup</span>
          <button className="icon-btn" onClick={() => nav("settings")} aria-label="Settings">⚙︎</button></div>
        {resumable && (
          <div className="resume">
            <span style={{ fontSize: 26 }} aria-hidden>🎪</span>
            <span style={{ flex: 1 }}>Game in progress<br /><span className="muted" style={{ fontSize: 15 }}>{game!.players.length} players · <b>{cardsLeft(game!)}</b> cards left</span></span>
            <button className="btn btn-gold" style={{ padding: "8px 14px", fontSize: 17 }} onClick={() => nav("play")}>Resume</button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {!decks && !error && <p className="muted" style={{ marginTop: 30, textAlign: "center" }}>Loading your decks…</p>}
        {decks && (
          <>
            <p className="label" style={{ margin: "18px 0 0" }}>Your decks</p>
            {owned.length ? (
              <div className="decks">{owned.map((d) => (
                <button key={d.id} className="deck-tile" onClick={() => open(d)}>
                  <span className="cover"><Cover deck={d} /></span>
                  <span className="name">{d.name}</span>
                  <span className="meta">{!d.playable ? "Coming soon" : ready[d.id] ? "✓ Ready offline" : `${d.languages?.length > 1 ? d.languages.map((l) => l.toUpperCase()).join(" / ") : "Tap to set up"}`}</span>
                </button>))}</div>
            ) : <div className="panel empty"><p style={{ margin: 0 }}>No decks yet. Decks you buy appear here automatically.</p></div>}
            {others.length > 0 && <>
              <p className="label" style={{ margin: "24px 0 0" }}>More decks</p>
              <div className="decks">{others.map((d) => (
                <button key={d.id} className="deck-tile locked" onClick={() => open(d)}>
                  <span className="cover"><Cover deck={d} /><span className="lock" aria-hidden>🔒</span></span>
                  <span className="name">{d.name}</span><span className="meta">Get this deck →</span>
                </button>))}</div>
            </>}
          </>
        )}
      </div>

      {download && (
        <Sheet title="Setting up the ring…" onClose={() => download.error && setDownload(null)}>
          <p className="muted" style={{ margin: 0 }}>Saving {download.deck.name} to this device so it works without Wi-Fi.</p>
          <div className="progress"><i style={{ width: `${(download.done / download.total) * 100}%` }} /></div>
          <p style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>{download.done} / {download.total} cards</p>
          {download.error && <><p className="error">{download.error}</p><button className="btn btn-gold" style={{ width: "100%" }} onClick={() => open(download.deck)}>Try again</button></>}
        </Sheet>
      )}
      {locked && (
        <Sheet title={locked.name} onClose={() => setLocked(null)}>
          {locked.owned
            ? <p>This deck is still being prepared. Check back soon!</p>
            : <><p>{locked.description || "A Kings Cup deck you don't own yet."}</p><p className="muted">Buy the physical deck and it's added to your library automatically.</p></>}
          <button className="btn btn-gold" style={{ width: "100%" }} onClick={() => setLocked(null)}>Got it</button>
        </Sheet>
      )}
    </section>
  );
}
