// The move from one diagram type to another (editor spec §73, render_type_morph). The view stays where it was. Each
// thing starts where the old type drew it and glides to where the new type puts it. A thing the old type did not draw
// grows in where it lands. So the reader sees where everything went (Roger, 8 Nov 2026). Host-free and pure.
import type { Spot } from './render-rooms.ts';

/** How long the move takes, in milliseconds. */
export const MORPH_MS = 400;

/** Eases in and out: slow at both ends, so the move starts and stops gently. */
export const eased = (t: number): number => {
  const u = Math.min(1, Math.max(0, t));
  return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
};

/**
 * Each spot of `to` part of the way, `t` from 0 to 1, from where `from` had it. A spot with no `from` grows from
 * nothing at its own place. At 1 every spot is just as `to` has it.
 */
export function morphed(
  from: ReadonlyMap<string, { x: number; y: number }>,
  to: ReadonlyMap<string, Spot>,
  t: number,
): Map<string, Spot> {
  const k = eased(t);
  const out = new Map<string, Spot>();
  for (const [key, end] of to) {
    const start = from.get(key);
    out.set(
      key,
      start
        ? { x: start.x + (end.x - start.x) * k, y: start.y + (end.y - start.y) * k, r: end.r }
        : { ...end, r: end.r * k },
    );
  }
  return out;
}
