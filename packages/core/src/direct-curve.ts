// A direct link's curve (editor spec §25, untangle_direct), for direct-links.ts. It is one gentle curve from box to box.
// It has its tip at either end and a place for its words. The Python library draws the same
// curve (graphspec/style/direct_curve.py). Host-free and pure.
import type { MarkPoint } from './plugin-diagrams.ts';
import type { Work } from './layout-work.ts';

/** The least room between two boxes, in pixels. */
const BOX_GAP = 12;

/** A box being placed: its key, its middle and its half width and height. */
export interface Placed {
  key: string;
  x: number;
  y: number;
  hw: number;
  hh: number;
  /** The group it must stay inside, as its edges, when it is in one. */
  inside?: { x0: number; y0: number; x1: number; y1: number };
  /** Where a person saw it last: it stays there, and a box over it moves off it instead (things_stay_put). */
  held?: true;
}

/** A direct link's curve: its points, where its tip is at either end, and where its words go. */
export interface Curve {
  at(t: number): MarkPoint;
  cubic(cutStart: number, cutEnd: number): MarkPoint[];
  tipAt(atStart: boolean): [MarkPoint, number];
  wordsAt(t: number, off: number): MarkPoint;
  ends: [MarkPoint, MarkPoint];
}

const lerp = (p: MarkPoint, q: MarkPoint, t: number): MarkPoint => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

/** Where along the curve, from `from` toward `to`, the curve is `cut` from its end `end`: by halving, as the library does. */
function cutAt(at: (t: number) => MarkPoint, end: MarkPoint, cut: number, from: number, to: number): number {
  if (cut <= 0) return from;
  let lo = from,
    hi = to;
  for (let i = 0; i < 40; i++) {
    const t = (lo + hi) / 2;
    if (Math.hypot(at(t)[0] - end[0], at(t)[1] - end[1]) < cut) lo = t;
    else hi = t;
  }
  return (lo + hi) / 2;
}

/** The curve from the edge of box `a` to the edge of box `b`. It bows sideways by `bow` of its length. */
export function curveOf(a: Placed, b: Placed, bow: number): Curve {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    long = Math.hypot(dx, dy) || 1;
  const mid: MarkPoint = [(a.x + b.x) / 2 - (dy / long) * bow * long, (a.y + b.y) / 2 + (dx / long) * bow * long];
  // where the curve leaves a's edge and meets b's, each found along the line to the bow's middle
  const p0 = edgeOf(a, mid),
    p3 = edgeOf(b, mid);
  const at = (t: number): MarkPoint => {
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * mid[0] + t * t * p3[0], u * u * p0[1] + 2 * u * t * mid[1] + t * t * p3[1]];
  };
  return {
    at,
    ends: [p0, p3],
    cubic(cutStart, cutEnd) {
      // the quadratic curve written as Graphviz's cubic one, its ends drawn in where an arrowhead takes their place.
      // The piece between the cuts is the same curve, so the line meets the arrowhead where `at` says it runs
      const u = cutAt(at, p0, cutStart, 0, 0.5),
        v = cutAt(at, p3, cutEnd, 1, 0.5);
      const s = at(u),
        e = at(v),
        c = lerp(lerp(p0, mid, u), lerp(mid, p3, u), v);
      return [
        s,
        [s[0] + (2 / 3) * (c[0] - s[0]), s[1] + (2 / 3) * (c[1] - s[1])],
        [e[0] + (2 / 3) * (c[0] - e[0]), e[1] + (2 / 3) * (c[1] - e[1])],
        e,
      ];
    },
    tipAt(atStart) {
      const tip = atStart ? p0 : p3;
      const angle = (Math.atan2(tip[1] - mid[1], tip[0] - mid[0]) * 180) / Math.PI;
      return [tip, angle];
    },
    wordsAt(t, off) {
      // words sit just above the line where it runs across, and beside it where it runs up or down
      const [x, y] = at(t);
      const flip = dx >= 0 ? -1 : 1;
      return [x - (dy / long) * off * flip, y + (dx / long) * off * flip];
    },
  };
}

/** Where the line from box `b`'s middle toward `p` crosses its edge. */
function edgeOf(b: Placed, p: MarkPoint): MarkPoint {
  const dx = p[0] - b.x,
    dy = p[1] - b.y;
  const k = Math.min(dx === 0 ? Infinity : b.hw / Math.abs(dx), dy === 0 ? Infinity : b.hh / Math.abs(dy), 1);
  return [b.x + dx * k, b.y + dy * k];
}

/** Pushes apart boxes that overlap, the way that parts them least, each pair counted in `work`: says how many moved. */
export function apart(boxes: Placed[], work: Work): number {
  let moves = 0;
  const sorted = [...boxes].sort((p, q) => p.x - p.hw - (q.x - q.hw));
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i] as Placed;
    for (let j = i + 1; j < sorted.length; j++) {
      if (!work.take(1)) return moves;
      const q = sorted[j] as Placed;
      if (q.x - q.hw >= p.x + p.hw + BOX_GAP) break;
      const ox = p.hw + q.hw + BOX_GAP - Math.abs(q.x - p.x),
        oy = p.hh + q.hh + BOX_GAP - Math.abs(q.y - p.y);
      if (ox <= 0 || oy <= 0) continue;
      if (p.held && q.held) continue;
      // one held stays: the other goes beside it, the nearest way that keeps it on the drawing (things_stay_put)
      if (p.held || q.held) offHeld(p.held ? q : p, p.held ? p : q);
      // else each moves half the overlap, along the way that is shorter
      else if (oy <= ox) {
        const s = (q.y >= p.y ? 1 : -1) * (oy / 2);
        moveTo(p, p.x, p.y - s);
        moveTo(q, q.x, q.y + s);
      } else {
        const s = (q.x >= p.x ? 1 : -1) * (ox / 2);
        moveTo(p, p.x - s, p.y);
        moveTo(q, q.x + s, q.y);
      }
      moves++;
    }
  }
  return moves;
}

/** Puts box `b` beside the box `held`, the nearest way round it that keeps `b` off the drawing's top and left edges. */
function offHeld(b: Placed, held: Placed): void {
  const [dx, dy] = [held.hw + b.hw + BOX_GAP, held.hh + b.hh + BOX_GAP];
  const ways: [number, number][] = [
    [held.x + dx, b.y],
    [held.x - dx, b.y],
    [b.x, held.y + dy],
    [b.x, held.y - dy],
  ];
  const fits = ways.filter(([x, y]) => x >= b.hw && y >= b.hh);
  const near = ([x, y]: [number, number]) => Math.hypot(x - b.x, y - b.y);
  const [x, y] = (fits.length ? fits : ways).reduce((m, w) => (near(w) < near(m) ? w : m));
  moveTo(b, x, y);
}

/** Puts box `b`'s middle at (`x`, `y`), kept inside its group. */
export function moveTo(b: Placed, x: number, y: number): void {
  const g = b.inside;
  b.x = g ? Math.min(Math.max(x, g.x0 + b.hw), g.x1 - b.hw) : x;
  b.y = g ? Math.min(Math.max(y, g.y0 + b.hh), g.y1 - b.hh) : y;
}
