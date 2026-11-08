// Round things on the globe: part of the globe, phase P3 of the rendering spec (wiki/Rendering-spec.md; editor spec
// §71, globe_view). A circle or a card on the ball's skin is squeezed along the way to the ball's middle as it turns
// from you, like a coin turning on a table. So rooms become ovals, and names lean away, as the ball spins (Roger,
// 8 Nov 2026). Host-free and pure.
import type { Mark, View } from './render-marks.ts';
import { middleOf } from './render-globe.ts';

/** How much a mark is squeezed: the way to the ball's middle in radians, and the share of its size left that way. */
export type Squash = [number, number];

/** A mark that may be squeezed. */
export interface Squashable {
  squash?: Squash;
}

/** The least a mark is squeezed to, so a name at the very edge never vanishes. */
const LEAST = 0.3;
/** The squeeze is only felt past this share of the way round, so things near the middle stay as drawn. */
const FELT = 0.02;

/** The squeeze of a thing at `x`, `y` on the screen: none near the ball's middle, or while the view is flat. */
export function squashAt(x: number, y: number, view: View): Squash | undefined {
  if (!view.globe) return undefined;
  const [cx, cy] = middleOf(view);
  const [dx, dy] = [x - cx, y - cy];
  const reach = Math.hypot(dx, dy) * (view.globe / view.scale); // the sine of how far round the ball it lies
  const k = Math.sqrt(Math.max(0, 1 - Math.min(1, reach) ** 2));
  return 1 - k < FELT ? undefined : [Math.atan2(dy, dx), Math.max(LEAST, k)];
}

/** `marks` with the clouds, dots and names squeezed to the globe. Roads and the ball already follow it. */
export function squashed(marks: Mark[], view: View): Mark[] {
  if (!view.globe) return marks;
  return marks.map((m) => {
    if (m.kind === 'cloud' || m.kind === 'dot') {
      const squash = squashAt(m.x, m.y, view);
      return squash ? { ...m, squash } : m;
    }
    if (m.kind === 'label') {
      const squash = squashAt(m.x + m.w / 2, m.y + m.h / 2, view);
      return squash ? { ...m, squash } : m;
    }
    return m;
  });
}
