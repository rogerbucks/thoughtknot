// Long rows folded into bands (editor spec §68, layout_screen_shaped), for grouped.ts. Roger, 25 Oct 2026: "The layout
// seems very sparse". A group's things, or a whole drawing's, laid out in one long row take a strip far from a
// screen's shape. Folded into bands side by side, they take about a screen's. Host-free and pure.
import type { GraphShape } from '../types-shape.ts';
import { viaKey } from './layered.ts';
import type { Layered, Size } from './layered.ts';

/** The gap kept inside a group's border on each side across the drawing, which links passing the group run along. */
export const GUTTER = 12;
/** The room between two links sharing a gutter. */
export const GUTTER_STEP = 4;
/** How far past its own box a link from a group's thing steps, into the room after its row, before it turns. */
export const STEP_OUT = 12;
/** The shape a group's box is folded towards, as its width over its height: a screen's. */
export const SCREEN = 1.6;
/** The room between two bands of a folded group. */
const BAND_GAP = 56;
/** The bounds of a layout's spots, boxes and bends. */
export function boundsOf(inner: Layered, sizes: ReadonlyMap<string, Size>): [number, number, number, number] {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const [k, [x, y]] of inner.spots) {
    const [w, h] = sizes.get(k) ?? [120, 40];
    [x0, y0, x1, y1] = [
      Math.min(x0, x - w / 2),
      Math.min(y0, y - h / 2),
      Math.max(x1, x + w / 2),
      Math.max(y1, y + h / 2),
    ];
  }
  for (const ps of inner.via.values())
    for (const [x, y] of ps) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  return [x0, y0, x1, y1];
}

/**
 * `inner`, a group's own rows, folded into bands side by side when it is longer across the drawing's way than `most`.
 * With no `most`, the rows of the whole drawing, folded when they are far from a screen's shape. Roger, 25 Oct 2026: "The layout seems very sparse". So a group of many things in one row takes about a screen's
 * shape, not one long strip. A thing goes in the band its middle falls in. A link within a band keeps its bends. A link
 * between bands steps into the room after its row, runs along the gutter inside the group's border, and steps back.
 * Its key is in `kept`, so its way is not moved again.
 */
export function folded(
  inner: Layered,
  shape: GraphShape,
  sizes: ReadonlyMap<string, Size>,
  rankdir: 'LR' | 'TB',
  pad: number,
  most?: number,
): Layered & { kept?: Set<string> } {
  const axis = rankdir === 'LR' ? 0 : 1,
    across = (1 - axis) as 0 | 1;
  const [x0, y0, x1, y1] = boundsOf(inner, sizes);
  const along = axis === 0 ? x1 - x0 : y1 - y0,
    wide = axis === 0 ? y1 - y0 : x1 - x0;
  // as few bands as keep it no longer across than `most`; with no most, as many as give it a screen's shape
  const bands = Math.min(
    inner.spots.size,
    most
      ? Math.ceil(wide / most)
      : Math.round(Math.sqrt(axis === 0 ? (SCREEN * wide) / along : wide / (SCREEN * along))),
  );
  if (bands < 2 || !(along > 0)) return inner;
  const half = (k: string) => (sizes.get(k) ?? [120, 40])[across] / 2;
  const order = [...inner.spots].sort((p, q) => p[1][across] - q[1][across]);
  const start = across === 0 ? x0 : y0;
  // each band about as wide as the rest; a thing starts a new band once its own is full. A band's top is its
  // highest thing's
  const bandOf = new Map<string, number>(),
    from: number[] = [];
  let opened = -Infinity;
  for (const [k, p] of order) {
    if (!from.length || (from.length < bands && p[across] - opened > wide / bands)) {
      opened = p[across] - half(k);
      from.push(Infinity);
    }
    const n = from.length - 1;
    bandOf.set(k, n);
    from[n] = Math.min(from[n] as number, p[across] - half(k));
  }
  const moved = (p: readonly [number, number], band: number): [number, number] => {
    const q: [number, number] = [p[0], p[1]];
    q[axis] += band * (along + BAND_GAP);
    q[across] += start - (from[band] as number);
    return q;
  };
  const out: Layered & { kept: Set<string> } = { spots: new Map(), via: new Map(), kept: new Set() };
  for (const [k, p] of inner.spots) out.spots.set(k, moved(p, bandOf.get(k) as number));
  // the deepest box of the row at `along`, so a step past it is in the room between rows
  const deepest = (at: number) =>
    [...out.spots].reduce(
      (most, [k, p]) => (Math.abs(p[axis] - at) < 1 ? Math.max(most, (sizes.get(k) ?? [120, 40])[axis]) : most),
      0,
    );
  // the gutter each link between bands runs along, inside the border on the near side, each in its own lane
  let lanes = 0;
  const gutter = start - (pad + GUTTER) / 2;
  const level = (a: number, c: number): [number, number] => (axis === 0 ? [a, c] : [c, a]);
  for (const l of shape.links) {
    const a = out.spots.get(l.from),
      b = out.spots.get(l.to);
    if (!a || !b || l.from === l.to) continue;
    const key = viaKey(l.from, l.to),
      band = bandOf.get(l.from) as number;
    if (band === bandOf.get(l.to)) {
      const bends = inner.via.get(key);
      if (bends)
        out.via.set(
          key,
          bends.map((p) => moved(p, band)),
        );
      continue;
    }
    const way = Math.sign(b[axis] - a[axis]) || 1;
    const stepA = a[axis] + way * (deepest(a[axis]) / 2 + STEP_OUT),
      stepB = b[axis] - way * (deepest(b[axis]) / 2 + STEP_OUT);
    const g = gutter + ((lanes++ % 5) - 2) * GUTTER_STEP;
    out.via.set(key, [level(stepA, a[across]), level(stepA, g), level(stepB, g), level(stepB, b[across])]);
    out.kept.add(key);
  }
  return out;
}
