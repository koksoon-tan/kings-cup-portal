import { getPrefs, reducedMotion } from "./prefs";

export function buzz(pattern: number | number[]) {
  if (!getPrefs().vibrate) return;
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

/** Full-screen confetti burst. */
export function confetti(ms = 3500) {
  if (reducedMotion()) return;
  const c = document.createElement("canvas");
  c.className = "confetti";
  document.body.appendChild(c);
  const W = innerWidth, H = innerHeight, dpr = devicePixelRatio || 1;
  c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext("2d")!; g.scale(dpr, dpr);
  const colors = ["#f2b632", "#c8102e", "#fbf1dc", "#a98cf0", "#4dd4ac"];
  const P = Array.from({ length: 160 }, () => ({ x: W / 2, y: H * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 13 - 4, s: 5 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: colors[Math.floor(Math.random() * colors.length)] }));
  const t0 = performance.now();
  const frame = (t: number) => {
    g.clearRect(0, 0, W, H);
    for (const p of P) { p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore(); }
    if (t - t0 < ms) requestAnimationFrame(frame); else c.remove();
  };
  requestAnimationFrame(frame);
}

/** Keeps the screen on during a game (where the browser allows it). */
let lock: WakeLockSentinel | null = null;
export async function keepAwake(on: boolean) {
  try {
    if (on && !lock && "wakeLock" in navigator) { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => (lock = null)); }
    if (!on && lock) { await lock.release(); lock = null; }
  } catch { /* not allowed */ }
}
