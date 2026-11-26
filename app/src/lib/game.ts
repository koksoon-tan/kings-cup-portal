// Pure game rules for one shared device. No React or Firebase here, so it's easy to test.
import { CARD_KEYS, rankOf, DEFAULT_EFFECTS, GameEffect } from "../../../shared/cards";

export const PLAYER_COLORS = ["#f2b632", "#ff6b6b", "#4dd4ac", "#6ec1ff", "#c39bff", "#ff9f43", "#f78fb3", "#9be15d", "#ffd166", "#5ee7df", "#ff8fab", "#b8f2e6"];
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;

export interface Player { name: string; color: string }
export interface Draw { card: string; player: number; at: number }
export type EndMode = "last" | "king4";

export interface Game {
  id: string;
  deckId: string;
  artVersion: number;
  lang: string;
  players: Player[];
  order: string[];          // shuffled card keys
  idx: number;              // next card to draw
  turn: number;             // whose turn it is (index into players)
  drawn: Draw[];
  kings: number;            // cards with the "cup" effect drawn so far
  rules: { text: string; by: string }[];
  mates: [number, number][];
  masters: Record<string, number>; // rank → player holding that title
  effects: Partial<Record<string, GameEffect>>;
  jokers: boolean;
  endMode: EndMode;
  status: "playing" | "finished";
  endedBy?: EndMode;
  history: string[];        // snapshots for undo
  startedAt: number;
}

export interface Setup {
  deckId: string;
  artVersion: number;
  lang: string;
  names: string[];          // turn order; blank = "Player N"
  jokers: boolean;
  endMode: EndMode;
  effects?: Partial<Record<string, GameEffect>>;
  /** Cards that have art; defaults to the full deck. */
  available?: string[];
}

/** Fisher–Yates with a cryptographic random source. */
export function shuffle<T>(items: T[], rand: (n: number) => number = cryptoRand): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function cryptoRand(n: number) {
  const lim = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= lim);
  return buf[0] % n;
}

export function playableCards(jokers: boolean) {
  return CARD_KEYS.filter((k) => k !== "BACK" && (jokers || !k.startsWith("JK")));
}

export function createGame(s: Setup, rand?: (n: number) => number): Game {
  const count = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, s.names.length));
  const players = Array.from({ length: count }, (_, i) => ({
    name: (s.names[i] ?? "").trim() || `Player ${i + 1}`,
    color: PLAYER_COLORS[i % PLAYER_COLORS.length],
  }));
  return {
    id: Math.random().toString(36).slice(2, 10),
    deckId: s.deckId,
    artVersion: s.artVersion,
    lang: s.lang,
    players,
    order: shuffle(playableCards(s.jokers).filter((k) => !s.available || s.available.includes(k)), rand),
    idx: 0,
    turn: 0,
    drawn: [],
    kings: 0,
    rules: [],
    mates: [],
    masters: {},
    effects: s.effects ?? DEFAULT_EFFECTS,
    jokers: s.jokers,
    endMode: s.endMode,
    status: "playing",
    history: [],
    startedAt: Date.now(),
  };
}

export const cardsLeft = (g: Game) => g.order.length - g.idx;
export const effectOf = (g: Game, card: string): GameEffect | null => g.effects[rankOf(card)] ?? null;

export interface DrawResult {
  game: Game;
  card: string;
  player: number;
  effect: GameEffect | null;
  /** The 4th cup card was just drawn. */
  cupOverflow: boolean;
  /** The game is over once this card is put away. */
  endsGame: boolean;
}

function snapshot(g: Game) {
  const { history: _h, ...rest } = g;
  return JSON.stringify(rest);
}

/** Draws the next card for the current player. The turn passes when `finishTurn` is called. */
export function draw(g: Game): DrawResult {
  if (g.status !== "playing" || g.idx >= g.order.length) throw new Error("No cards left");
  const history = [...g.history, snapshot(g)].slice(-60);
  const card = g.order[g.idx];
  const player = g.turn;
  const effect = effectOf(g, card);
  const kings = g.kings + (effect === "cup" ? 1 : 0);
  const masters = { ...g.masters };
  if (effect === "master") masters[rankOf(card)] = player;
  const next: Game = { ...g, history, idx: g.idx + 1, drawn: [...g.drawn, { card, player, at: Date.now() }], kings, masters };
  const cupOverflow = effect === "cup" && kings === 4;
  const endsGame = next.idx >= next.order.length || (cupOverflow && g.endMode === "king4");
  return { game: next, card, player, effect, cupOverflow, endsGame };
}

/** Records what the player chose for the card's effect, passes the turn and ends the game if needed. */
export function finishTurn(g: Game, input: { rule?: string; mate?: number | null } = {}): Game {
  const last = g.drawn[g.drawn.length - 1];
  if (!last) return g;
  const by = g.players[last.player].name;
  const rules = input.rule?.trim() ? [...g.rules, { text: input.rule.trim().slice(0, 120), by }] : g.rules;
  const mates = input.mate != null && input.mate !== last.player ? [...g.mates, [last.player, input.mate] as [number, number]] : g.mates;
  const out = g.idx >= g.order.length;
  const king4 = g.endMode === "king4" && g.kings >= 4;
  return {
    ...g,
    rules,
    mates,
    turn: (g.turn + 1) % g.players.length,
    ...(out || king4 ? { status: "finished" as const, endedBy: (out && !king4 ? "last" : "king4") as EndMode } : {}),
  };
}

export function undo(g: Game): Game {
  if (!g.history.length) return g;
  const prev = JSON.parse(g.history[g.history.length - 1]) as Omit<Game, "history">;
  return { ...prev, history: g.history.slice(0, -1) };
}

export function skip(g: Game): Game {
  return { ...g, turn: (g.turn + 1) % g.players.length };
}

export function endEarly(g: Game): Game {
  return { ...g, status: "finished", endedBy: "last" };
}

export function upNext(g: Game, n = 3): Player[] {
  const out: Player[] = [];
  for (let k = 1; k <= Math.min(n, g.players.length - 1); k++) out.push(g.players[(g.turn + k) % g.players.length]);
  return out;
}

export function replay(g: Game, rand?: (n: number) => number): Game {
  return createGame({ deckId: g.deckId, artVersion: g.artVersion, lang: g.lang, names: g.players.map((p) => p.name), jokers: g.jokers, endMode: g.endMode, effects: g.effects, available: g.order }, rand);
}

export interface Summary {
  perPlayer: { player: Player; cards: number }[];
  cupDrawers: string[];
  cupDrinker: string | null;
  rules: Game["rules"];
  total: number;
}
export function summarize(g: Game): Summary {
  const perPlayer = g.players.map((player, i) => ({ player, cards: g.drawn.filter((d) => d.player === i).length }));
  const cupDrawers = g.drawn.filter((d) => effectOf(g, d.card) === "cup").map((d) => g.players[d.player].name);
  return { perPlayer, cupDrawers, cupDrinker: cupDrawers[3] ?? null, rules: g.rules, total: g.drawn.length };
}

// ---- persistence (one saved game per device) ----
const KEY = "kc-play-game";
export function saveGame(g: Game | null) {
  try { g ? localStorage.setItem(KEY, JSON.stringify(g)) : localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}
export function loadGame(): Game | null {
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as Game) : null; } catch { return null; }
}
