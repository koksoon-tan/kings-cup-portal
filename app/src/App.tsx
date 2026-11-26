import { useCallback, useEffect, useState } from "react";
import { useAccount } from "./lib/account";
import { useLibrary, LibraryDeck, loadDeckFonts } from "./lib/decks";
import { Game, loadGame, replay, saveGame } from "./lib/game";
import { usePrefs } from "./lib/prefs";
import { Splash, Login, LostCode, Blocked } from "./screens/Entry";
import { Library } from "./screens/Library";
import { Setup } from "./screens/Setup";
import { Play } from "./screens/Play";
import { Summary } from "./screens/Summary";
import { Settings } from "./screens/Settings";
import { Toaster } from "./components/ui";
import { DemoBadge } from "@demo";

export type Route = "splash" | "login" | "lost" | "library" | "setup" | "play" | "summary" | "settings";
export type Nav = (r: Route) => void;
const ROUTES: Route[] = ["splash", "login", "lost", "library", "setup", "play", "summary", "settings"];
const PUBLIC: Route[] = ["splash", "login", "lost"];

// Routes are plain hash names (#library, #play…) so the phone's back button works.
const readHash = (): Route => { const h = location.hash.slice(1) as Route; return ROUTES.includes(h) ? h : "splash"; };

export default function App() {
  const { loading, customerId, customer } = useAccount();
  const { decks, error } = useLibrary();
  const prefs = usePrefs();
  const [route, setRoute] = useState<Route>(readHash);
  const [game, setGameState] = useState<Game | null>(loadGame);
  const [deckId, setDeckId] = useState<string | null>(() => loadGame()?.deckId ?? null);
  const [presetNames, setPresetNames] = useState<string[] | undefined>();
  const [pendingCode, setPendingCode] = useState("");
  const [fontsReady, setFontsReady] = useState<string | null>(null);

  const nav: Nav = useCallback((r) => { if (location.hash.slice(1) !== r) location.hash = r; setRoute(r); }, []);
  useEffect(() => { const f = () => setRoute(readHash()); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  const setGame = (g: Game | null) => { setGameState(g); saveGame(g); };

  const signedIn = !!customerId;
  const deck = decks?.find((d) => d.id === (route === "setup" ? deckId : game?.deckId ?? deckId)) as LibraryDeck | undefined;
  useEffect(() => { if (deck) loadDeckFonts(deck).finally(() => setFontsReady(`${deck.id}:${deck.artVersion}`)); }, [deck?.id, deck?.artVersion]);

  // Guards
  useEffect(() => {
    if (loading) return;
    if (!signedIn && !PUBLIC.includes(route)) nav("login");
    if (signedIn && route === "lost") nav("library");
    if (signedIn && decks) {
      if (route === "setup" && !deck) nav("library");
      if ((route === "play" && (!game || game.status !== "playing" || !deck)) || (route === "summary" && !game)) nav("library");
    }
  }, [loading, signedIn, route, decks, !!deck, game?.status]);

  let screen: React.ReactNode = <div className="loading">Raising the big top…</div>;
  if (!loading) {
    if (signedIn && customer?.banned) screen = <Blocked />;
    else if (route === "splash") screen = <Splash nav={nav} signedIn={signedIn} />;
    else if (route === "login") screen = <Login key={pendingCode} nav={nav} initialCode={pendingCode} signedIn={signedIn} />;
    else if (route === "lost") screen = <LostCode nav={nav} onUseCode={(c) => { setPendingCode(c); nav("login"); }} />;
    else if (signedIn && route === "library") screen = <Library nav={nav} decks={decks} error={error} game={game} onPick={(d) => { setDeckId(d.id); setPresetNames(undefined); nav("setup"); }} />;
    else if (signedIn && route === "setup" && deck) screen = <Setup nav={nav} deck={deck} presetNames={presetNames} onStart={(g) => { setGame(g); nav("play"); }} />;
    else if (signedIn && route === "play" && game && deck) screen = fontsReady === `${deck.id}:${deck.artVersion}` ? <Play nav={nav} deck={deck} game={game} setGame={setGame} /> : <div className="loading">Shuffling…</div>;
    else if (signedIn && route === "summary" && game) screen = (
      <Summary game={game}
        onAgain={() => { setGame(replay(game)); nav("play"); }}
        onChangePlayers={() => { setDeckId(game.deckId); setPresetNames(game.players.map((p) => p.name.match(/^Player \d+$/) ? "" : p.name)); setGame(null); nav("setup"); }}
        onDecks={() => { setGame(null); nav("library"); }} />
    );
    else if (signedIn && route === "settings") screen = <Settings onBack={() => history.length > 1 ? history.back() : nav("library")} />;
  }

  return (
    <div className={`app ${prefs.reduceMotion ? "reduce" : ""}`}>
      {screen}
      <Toaster />
      <DemoBadge />
    </div>
  );
}
