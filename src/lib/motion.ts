// Small motion helpers for the dashboard: one shared animation loop, an easing curve, and the "reduce motion" setting.

export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Ease-out: fast at first, settling softly on the real value. */
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

type Tick = (now: number) => boolean; // true while it still has frames to draw
const ticks = new Set<Tick>();
let raf = 0;
const loop = (now: number) => {
  for (const t of [...ticks]) if (!t(now)) ticks.delete(t);
  raf = ticks.size ? requestAnimationFrame(loop) : 0;
};

/** Run `onUpdate(progress 0..1)` for `duration` ms after `delay` ms. Returns a function that stops it. */
export function animate(onUpdate: (p: number) => void, { duration = 1100, delay = 0 }: { duration?: number; delay?: number } = {}) {
  let start: number | null = null;
  const tick: Tick = (now) => {
    start ??= now + delay;
    const p = Math.min(1, Math.max(0, (now - start) / duration));
    onUpdate(p === 0 ? 0 : easeOut(p));
    return p < 1;
  };
  ticks.add(tick);
  if (!raf) raf = requestAnimationFrame(loop);
  return () => void ticks.delete(tick);
}

/** Money (satang) while it runs up: whole baht on the way, the exact amount (with satang) when it lands. */
export const settleBaht = (final: number, write: (satang: number) => string) => (v: number) => write(v === final ? v : Math.round(v / 100) * 100);
