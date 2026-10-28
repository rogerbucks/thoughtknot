// A trunk of links between two groups (editor spec §25, untangle-fold.ts). It is laid out as the one link it stands
// for, and put back on that link's way after (own-engine.ts). Host-free and pure.
import type { GraphShape } from '../types-shape.ts';
import { TRUNK_LINK, viaKey } from './layered.ts';

/** A trunk's two points (fold-source.ts): where its links meet, and where they part. */
const TRUNK = /^trunk: (\d+) (in|out)$/;
/** How far along its one piece or lane a trunk's links meet, and how far from its end they part. */
const MEET = 0.4;
/** A point across and down. */
type Point = [number, number];

/** A trunk laid out as the one link it stands for: from the thing its links come from to the one they go to. */
export interface Trunk {
  in: string;
  out: string;
  from: string;
  to: string;
}

/**
 * `shape` with each trunk that runs from one thing to one other taken out, and a link between those two in its place.
 * So the trunk is laid out as one link, not as two more things in rows of their own.
 */
export function trunksOut(shape: GraphShape): { shape: GraphShape; trunks: Trunk[] } {
  const ends = new Map<string, { in: string; out: string; from: Set<string>; to: Set<string> }>();
  const endOf = (key: string) => {
    const m = TRUNK.exec(key);
    if (!m) return undefined;
    const t = m[1] as string;
    return (
      ends.get(t) ??
      ends
        .set(t, { in: key.replace(/out$/, 'in'), out: key.replace(/in$/, 'out'), from: new Set(), to: new Set() })
        .get(t)
    );
  };
  for (const l of shape.links) {
    const a = TRUNK.exec(l.from),
      b = TRUNK.exec(l.to);
    if (b?.[2] === 'in' && !a) endOf(l.to)?.from.add(l.from);
    if (a?.[2] === 'out' && !b) endOf(l.from)?.to.add(l.to);
  }
  const trunks: Trunk[] = [];
  for (const e of ends.values())
    if (e.from.size === 1 && e.to.size === 1) {
      const [from] = e.from,
        [to] = e.to;
      if (from !== to) trunks.push({ in: e.in, out: e.out, from: from as string, to: to as string });
    }
  if (!trunks.length) return { shape, trunks };
  const gone = new Set(trunks.flatMap((t) => [t.in, t.out]));
  return {
    shape: {
      things: shape.things.filter((t) => !gone.has(t.key)),
      links: [
        ...shape.links.filter((l) => !gone.has(l.from) && !gone.has(l.to)),
        ...trunks.map((t) => ({ from: t.from, type: TRUNK_LINK, to: t.to })),
      ],
    },
    trunks,
  };
}

/**
 * Each of `trunks` put back on the way its link was laid out. Its links meet in the first row it skips. They part in
 * the last, in the lane its link takes there. A trunk's link has lanes of its own (`TRUNK_LINK`). Between rows side
 * by side, they meet and part along the one piece. Each piece of the trunk takes its share of the way's bends.
 */
export function trunksBack(
  trunks: readonly Trunk[],
  spots: Map<string, [number, number]>,
  via: Map<string, [number, number][]>,
  axis: 0 | 1,
): void {
  const lerp = (p: Point, q: Point, s: number): Point => [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s];
  for (const t of trunks) {
    const a = spots.get(t.from),
      b = spots.get(t.to);
    if (!a || !b) continue;
    const way = via.get(viaKey(t.from, t.to)) ?? [];
    const path: Point[] = way.length >= 2 ? way : [a, b];
    const k = path.length - 1;
    if (k < 3) {
      spots.set(t.in, onPiece(path[0] as Point, path[k] as Point, MEET, axis));
      spots.set(t.out, onPiece(path[0] as Point, path[k] as Point, 1 - MEET, axis));
      if (way.length < 2) continue;
      via.set(viaKey(t.from, t.in), [path[0] as Point]);
      via.set(viaKey(t.out, t.to), [path[k] as Point]);
      continue;
    }
    // the lanes are the pieces from 1 to 2, from 3 to 4, and on; one lane alone holds both ends
    const one = k === 3;
    spots.set(t.in, lerp(path[1] as Point, path[2] as Point, one ? MEET : 0.5));
    spots.set(t.out, lerp(path[k - 2] as Point, path[k - 1] as Point, one ? 1 - MEET : 0.5));
    via.set(viaKey(t.from, t.in), [path[0] as Point, path[1] as Point]);
    via.set(viaKey(t.in, t.out), path.slice(2, k - 1));
    via.set(viaKey(t.out, t.to), [path[k - 1] as Point, path[k] as Point]);
  }
}

/**
 * The point a share `s` along the piece from `p` to `q`, drawn as routed-curve.ts draws it. It leaves and arrives
 * running the drawing's way (`axis` 0 across, 1 down).
 */
function onPiece(p: Point, q: Point, s: number, axis: 0 | 1): Point {
  const half = (q[axis] - p[axis]) / 2;
  const c1: Point = axis === 0 ? [p[0] + half, p[1]] : [p[0], p[1] + half];
  const c2: Point = axis === 0 ? [q[0] - half, q[1]] : [q[0], q[1] - half];
  const r = 1 - s;
  const at = (c: 0 | 1) => r * r * r * p[c] + 3 * r * r * s * c1[c] + 3 * r * s * s * c2[c] + s * s * s * q[c];
  return [at(0), at(1)];
}
