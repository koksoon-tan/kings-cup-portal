// Small synthesised sound effects (no audio files to download). Browsers only allow sound after a tap.
import { getPrefs } from "./prefs";

let ac: AudioContext | null = null;
function audio() {
  if (!getPrefs().sound) return null;
  try {
    ac ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ac.state === "suspended") void ac.resume();
    return ac;
  } catch { return null; }
}
function tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.15, when = 0, slide?: number) {
  const a = audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + when;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur);
}
function noise(dur: number, vol = 0.2, when = 0, freq = 1800) {
  const a = audio(); if (!a) return;
  const b = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  f.type = "bandpass"; f.frequency.value = freq; g.gain.value = vol;
  s.buffer = b; s.connect(f).connect(g).connect(a.destination); s.start(a.currentTime + when);
}
export const sfx = {
  tap: () => tone(660, 0.08, "triangle", 0.08),
  whoosh: () => noise(0.35, 0.25, 0, 900),
  flip: () => { noise(0.06, 0.3, 0, 3000); tone(880, 0.1, "triangle", 0.06, 0.02); },
  drum: () => { for (let i = 0; i < 8; i++) noise(0.05, 0.12 + i * 0.02, i * 0.045, 300); },
  turn: () => { tone(523, 0.12, "square", 0.05); tone(784, 0.16, "square", 0.05, 0.1); },
  king: () => [392, 494, 587, 784].forEach((f, i) => tone(f, 0.25, "sawtooth", 0.05, i * 0.09)),
  fanfare: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, i === 5 ? 0.6 : 0.18, "sawtooth", 0.06, i * 0.14)),
  error: () => tone(200, 0.25, "square", 0.07, 0, 120),
  ok: () => { tone(660, 0.1, "triangle", 0.1); tone(990, 0.2, "triangle", 0.1, 0.09); },
};
