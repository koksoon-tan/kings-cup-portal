import { useEffect, useState } from "react";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { db, storage } from "./firebase";
import { CARD_KEYS, TextStyle, GameEffect, DEFAULT_EFFECTS } from "../../../shared/cards";
import { fontKey } from "../../../shared/render";
import { useAccount } from "./account";
import * as cache from "./deckCache";

export interface Deck {
  id: string; name: string; description?: string; status: string; appAccess: "purchase" | "free" | "paid";
  languages: string[]; defaultLanguage: string; expiryDate?: { toMillis(): number } | null;
  cards?: Record<string, { path: string; previewPath: string; gamePath?: string; width: number; height: number }>;
  artVersion?: number; textStyle: TextStyle; actions: Record<string, Record<string, { title: string; text: string }>>;
  cardOverrides?: Record<string, unknown>; effects?: Partial<Record<string, GameEffect>>;
}

export interface LibraryDeck extends Deck { owned: boolean; playable: boolean }

/** Published decks, split into the ones this player owns (or are free) and the ones they could get. */
export function useLibrary() {
  const { customer } = useAccount();
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => onSnapshot(query(collection(db, "decks"), where("status", "==", "published")),
    (snap) => setDecks(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Deck)),
    () => setError("Couldn't load your decks. Check your connection.")), []);
  const owned = new Set(customer?.ownedDeckIds ?? []);
  const now = Date.now();
  const list: LibraryDeck[] = (decks ?? [])
    .filter((d) => !d.expiryDate || d.expiryDate.toMillis() > now)
    .map((d) => {
      const isOwned = d.appAccess === "free" || owned.has(d.id);
      return { ...d, owned: isOwned, playable: isOwned && !!d.cards && CARD_KEYS.every((k) => d.cards![k]) };
    })
    .sort((a, b) => Number(b.owned) - Number(a.owned) || a.name.localeCompare(b.name));
  return { decks: decks ? list : null, error };
}

export const effectsOf = (d: Deck) => d.effects ?? DEFAULT_EFFECTS;
const cardPath = (d: Deck, k: string) => d.cards![k].gamePath ?? d.cards![k].previewPath;

/** Saves every card image (and custom fonts) on the device so the game works offline. */
export async function downloadDeck(d: Deck, onProgress: (done: number, total: number) => void) {
  const v = d.artVersion ?? 0;
  if (await cache.isComplete(d.id, v)) { onProgress(CARD_KEYS.length, CARD_KEYS.length); return; }
  let done = 0;
  const queue = [...CARD_KEYS];
  const worker = async () => {
    while (queue.length) {
      const k = queue.shift()!;
      if (!(await cache.getCard(d.id, v, k))) {
        const url = await getDownloadURL(ref(storage, cardPath(d, k)));
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Download failed (${res.status})`);
        await cache.putCard(d.id, v, k, await res.blob());
      }
      onProgress(++done, CARD_KEYS.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  for (const id of [d.textStyle.fontId, d.textStyle.titleFontId]) {
    if (!id || (await cache.getFont(id))) continue;
    const f = await getDoc(doc(db, "fonts", id));
    if (!f.exists()) continue;
    const res = await fetch(await getDownloadURL(ref(storage, f.data().path)));
    await cache.putFont(id, await res.blob());
  }
  await cache.markComplete(d.id, v);
  await cache.prune(d.id, v);
}

/** Loads the deck's custom fonts (from the device cache) so canvas can draw with them. */
export async function loadDeckFonts(d: Deck) {
  await Promise.all([d.textStyle.fontId, d.textStyle.titleFontId].map(async (id) => {
    if (!id || [...document.fonts].some((f) => f.family === fontKey(id))) return;
    const blob = await cache.getFont(id);
    if (!blob) return;
    const face = new FontFace(fontKey(id), await blob.arrayBuffer());
    await face.load(); document.fonts.add(face);
  }));
  await Promise.all(["Rye", "Barlow Condensed", d.textStyle.fontFamily, d.textStyle.titleFontFamily].filter(Boolean)
    .map((f) => document.fonts.load(`bold 24px "${f}"`).catch(() => undefined)));
}
