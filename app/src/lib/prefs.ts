import { useSyncExternalStore } from "react";

export interface Prefs { sound: boolean; vibrate: boolean; reduceMotion: boolean; lang: string | null }
const KEY = "kc-play-prefs";
const DEFAULTS: Prefs = { sound: true, vibrate: true, reduceMotion: false, lang: null };
let prefs: Prefs = (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return DEFAULTS; } })();
const subs = new Set<() => void>();

export const getPrefs = () => prefs;
export function setPrefs(p: Partial<Prefs>) {
  prefs = { ...prefs, ...p };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage blocked */ }
  subs.forEach((f) => f());
}
export function usePrefs() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, getPrefs);
}
export const reducedMotion = () => prefs.reduceMotion || matchMedia("(prefers-reduced-motion: reduce)").matches;
