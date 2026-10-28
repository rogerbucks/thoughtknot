// A direct link's curve (editor spec §25, untangle_direct), for direct-links.ts. It is one gentle curve from box to box.
// It has its tip at either end and a place for its words. The Python library draws the same
// curve (graphspec/style/direct_curve.py). Host-free and pure.
import type { MarkPoint } from './plugin-diagrams.ts';

/** A box being placed: its key, its middle and its half width and height. */
export interface Placed {
  key: string;
  x: number;
  y: number;
  hw: number;
  hh: number;
  /** The group it must stay inside, as its edges, when it is in one. */
  inside?: { x0: number; y0: number; x1: number; y1: number };
}

/** A direct link's curve: its points, where its tip is at either end, and where its words go. */
export interface Curve {
  at(t: number): MarkPoint;
  cubic(cutStart: number, cutEnd: number): MarkPoint[];
  tipAt(atStart: boolean): [MarkPoint, number];
  wordsAt(t: number, off: number): MarkPoint;
  ends: [MarkPoint, MarkPoint];
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
  const toward = (p: MarkPoint, q: MarkPoint, by: number): MarkPoint => {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    return [p[0] + ((q[0] - p[0]) * by) / d, p[1] + ((q[1] - p[1]) * by) / d];
  };
  return {
    at,
    ends: [p0, p3],
    cubic(cutStart, cutEnd) {
      // the quadratic curve written as Graphviz's cubic one, its ends drawn in where an arrowhead takes their place
      const s = toward(p0, mid, cutStart),
        e = toward(p3, mid, cutEnd);
      return [
        s,
        [s[0] + (2 / 3) * (mid[0] - s[0]), s[1] + (2 / 3) * (mid[1] - s[1])],
        [e[0] + (2 / 3) * (mid[0] - e[0]), e[1] + (2 / 3) * (mid[1] - e[1])],
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
