import { useEffect, useState } from "react";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { db, storage } from "./firebase";
import { CARD_KEYS, TextStyle, GameEffect, DEFAULT_EFFECTS } from "../../../shared/cards";
import { playableCards } from "./game";
import { fontKey } from "../../../shared/render";
import { useAccount } from "./account";
import * as cache from "./deckCache";

export interface Deck {
  id: string; name: string; description?: string; status: string; appAccess: "purchase" | "free" | "paid";
  languages: string[]; defaultLanguage: string; expiryDate?: { toMillis(): number } | null;
  cards?: Record<string, { path: string; previewPath: string; gamePath?: string; width: number; height: number }>;
  artVersion?: number; textStyle: TextStyle;
  cardOverrides?: Record<string, unknown>;
  /** Global action text + effects (settings/actions), merged onto every deck. */
  actions: Record<string, Record<string, { title: string; text: string }>>;
  effects: Partial<Record<string, GameEffect>>;
}

export interface LibraryDeck extends Deck { owned: boolean; playable: boolean; available: string[] }

/** Cards that have art (decks may be uploaded before all 55 images are ready). */
export const availableCards = (d: Pick<Deck, "cards">) => playableCards(true).filter((k) => d.cards?.[k]);

/** Published decks, split into the ones this player owns (or are free) and the ones they could get. */
export function useLibrary() {
  const { customer } = useAccount();
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [global, setGlobal] = useState<{ actions?: Deck["actions"]; effects?: Deck["effects"] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!customer) { setDecks(null); return; }
    const a = onSnapshot(query(collection(db, "decks"), where("status", "==", "published")),
      (snap) => setDecks(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Deck)),
      () => setError("Couldn't load your decks. Check your connection."));
    const b = onSnapshot(doc(db, "settings", "actions"), (s) => setGlobal(s.data() ?? {}), () => setGlobal({}));
    return () => { a(); b(); };
  }, [!!customer]);
  const owned = new Set(customer?.ownedDeckIds ?? []);
  const now = Date.now();
  const list: LibraryDeck[] = (global ? decks ?? [] : [])
    .filter((d) => !d.expiryDate || d.expiryDate.toMillis() > now)
    .map((d) => {
      const isOwned = d.appAccess === "free" || owned.has(d.id);
      const available = availableCards(d);
      return { ...d, actions: global?.actions ?? {}, effects: global?.effects ?? DEFAULT_EFFECTS, owned: isOwned, available, playable: isOwned && !!d.cards?.BACK && available.length > 0 };
    })
    .sort((a, b) => Number(b.owned) - Number(a.owned) || a.name.localeCompare(b.name));
  return { decks: decks && global ? list : null, error };
}

export const effectsOf = (d: Deck) => d.effects ?? DEFAULT_EFFECTS;
const presentKeys = (d: Deck) => CARD_KEYS.filter((k) => d.cards?.[k]);
const cardPath = (d: Deck, k: string) => d.cards![k].gamePath ?? d.cards![k].previewPath;

/** Saves every card image (and custom fonts) on the device so the game works offline. */
export async function downloadDeck(d: Deck, onProgress: (done: number, total: number) => void) {
  const v = d.artVersion ?? 0;
  const keys = presentKeys(d);
  if (await cache.isComplete(d.id, v)) { onProgress(keys.length, keys.length); return; }
  let done = 0;
  const queue = [...keys];
  const worker = async () => {
    while (queue.length) {
      const k = queue.shift()!;
      if (!(await cache.getCard(d.id, v, k))) {
        const url = await getDownloadURL(ref(storage, cardPath(d, k)));
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Download failed (${res.status})`);
        await cache.putCard(d.id, v, k, await res.blob());
      }
      onProgress(++done, keys.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  for (const id of [d.textStyle.fontId, d.textStyle.title?.fontId]) {
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
  await Promise.all([d.textStyle.fontId, d.textStyle.title?.fontId].map(async (id) => {
    if (!id || [...document.fonts].some((f) => f.family === fontKey(id))) return;
    const blob = await cache.getFont(id);
    if (!blob) return;
    const face = new FontFace(fontKey(id), await blob.arrayBuffer());
    await face.load(); document.fonts.add(face);
  }));
  await Promise.all(["Rye", "Barlow Condensed", d.textStyle.fontFamily, d.textStyle.title?.fontFamily].filter(Boolean)
    .map((f) => document.fonts.load(`bold 24px "${f}"`).catch(() => undefined)));
}
