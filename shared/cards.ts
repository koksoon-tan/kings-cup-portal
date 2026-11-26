// Shared by the admin dashboard and the player app.
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export const SUITS = ["S", "H", "D", "C"] as const;
export const SUIT_NAMES: Record<string, string> = { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" };
export const SUIT_SYMBOLS: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const RANK_NAMES: Record<string, string> = { A: "Ace", J: "Jack", Q: "Queen", K: "King", JOKER: "Joker" };
/** Ranks that carry action text (one action per rank; jokers share one). */
export const ACTION_KEYS = [...RANKS, "JOKER"] as const;
export const CARD_KEYS = [...SUITS.flatMap((s) => RANKS.map((r) => `${r}${s}`)), "JK1", "JK2", "BACK"];

export function rankOf(cardKey: string): string {
  if (cardKey.startsWith("JK")) return "JOKER";
  return cardKey.slice(0, -1);
}

export function cardLabel(cardKey: string) {
  if (cardKey === "BACK") return "Card back";
  if (cardKey.startsWith("JK")) return `Joker ${cardKey.slice(2)}`;
  const r = rankOf(cardKey);
  return `${RANK_NAMES[r] ?? r} of ${SUIT_NAMES[cardKey.slice(-1)]}`;
}

export const LANGUAGES: Record<string, string> = {
  en: "English", ms: "Bahasa Melayu", zh: "中文", id: "Bahasa Indonesia", th: "ไทย", vi: "Tiếng Việt", tl: "Filipino",
};

export const COUNTRIES: Record<string, string> = {
  MY: "Malaysia", SG: "Singapore", ID: "Indonesia", TH: "Thailand", PH: "Philippines", VN: "Vietnam",
  US: "United States", GB: "United Kingdom", AU: "Australia",
};

export interface TextBox { x: number; y: number; w: number; h: number } // percentages of card size
/** Title styling. Any field left undefined follows the action text style (size defaults to 1.3x). */
export interface TitleStyle {
  fontId?: string | null;
  fontFamily?: string;
  color?: string;
  sizePct?: number;
  align?: "left" | "center" | "right";
  bold?: boolean;
  uppercase?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
}

export interface TextStyle {
  fontId: string | null;
  fontFamily: string;
  color: string;
  sizePct: number; // font size as % of card width
  align: "left" | "center" | "right";
  vAlign: "top" | "middle" | "bottom";
  bold: boolean;
  uppercase: boolean;
  strokeColor: string;
  strokeWidth: number;
  showTitle: boolean;
  title?: TitleStyle;
  box: TextBox;
}

export const DEFAULT_STYLE: TextStyle = {
  fontId: null,
  fontFamily: "Arial",
  color: "#111111",
  sizePct: 5.5,
  align: "center",
  vAlign: "middle",
  bold: true,
  uppercase: false,
  strokeColor: "#ffffff",
  strokeWidth: 0,
  showTitle: true,
  box: { x: 12, y: 62, w: 76, h: 26 },
};

/** What the player app does when a card of this rank is drawn (set on the Action text page). */
export type GameEffect = "rule" | "mate" | "master" | "cup";
export const GAME_EFFECTS: Record<GameEffect, { label: string; help: string }> = {
  rule: { label: "Make a rule", help: "Player types a rule; it stays on screen for the rest of the game" },
  mate: { label: "Pick a mate", help: "Player picks a drinking mate" },
  master: { label: "Becomes master", help: "Player holds a title (e.g. Question Master) until this rank is drawn again" },
  cup: { label: "King's Cup", help: "Fills the cup; the 4th one overflows (and can end the game)" },
};
export const DEFAULT_EFFECTS: Partial<Record<string, GameEffect>> = { K: "cup" };

/** Fonts bundled with both apps (self-hosted), plus common system fonts. */
export const BUILTIN_FONTS = ["Rye", "Barlow Condensed"];
export const SYSTEM_FONTS = ["Arial", "Helvetica", "Georgia", "Times New Roman", "Verdana", "Trebuchet MS", "Impact", "Courier New"];
