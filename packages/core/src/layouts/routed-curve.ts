// A link routed through bends (editor spec §68, layout_links_routed), for direct-links.ts. Our layered layout gives
// a link that skips rows a bend in each row it crosses, in a lane kept between the boxes. The link is drawn as one
// smooth curve through them, so it passes between boxes, never over one. Host-free and pure.
import type { Curve, Placed } from '../direct-curve.ts';
import type { MarkPoint } from '../plugin-diagrams.ts';

/** Where the line from box `b`'s middle toward `p` crosses its edge. */
function edgeOf(b: Placed, p: MarkPoint): MarkPoint {
  const dx = p[0] - b.x,
    dy = p[1] - b.y;
  const k = Math.min(dx === 0 ? Infinity : b.hw / Math.abs(dx), dy === 0 ? Infinity : b.hh / Math.abs(dy), 1);
  return [b.x + dx * k, b.y + dy * k];
}

/** How many straight pieces follow each piece of a curve, to find a place along it. */
const STEPS = 8;

/** `p` moved `by` toward `q`. */
function toward(p: MarkPoint, q: MarkPoint, by: number): MarkPoint {
  const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  return [p[0] + ((q[0] - p[0]) * by) / d, p[1] + ((q[1] - p[1]) * by) / d];
}

/** End `p` drawn in `by` along `axis` toward `q`, as the curve leaves it; toward `q` itself where `q` is level. */
function inward(p: MarkPoint, q: MarkPoint, by: number, axis: 0 | 1): MarkPoint {
  const d = Math.sign(q[axis] - p[axis]);
  if (!d) return toward(p, q, by);
  return axis === 0 ? [p[0] + d * by, p[1]] : [p[0], p[1] + d * by];
}

/**
 * Cubic curve points through every point of `path`: a start, then three for each piece. Each piece leaves and arrives
 * running the drawing's way (`axis` 0 across, 1 down), as a flow chart's links do. So a piece between rows is a
 * gentle S, and a piece through a lane stays straight.
 */
function smooth(path: readonly MarkPoint[], axis: 0 | 1): MarkPoint[] {
  const out: MarkPoint[] = [path[0] as MarkPoint];
  for (let i = 0; i + 1 < path.length; i++) {
    const p = path[i] as MarkPoint,
      q = path[i + 1] as MarkPoint;
    const half = (q[axis] - p[axis]) / 2;
    const c1: MarkPoint = axis === 0 ? [p[0] + half, p[1]] : [p[0], p[1] + half];
    const c2: MarkPoint = axis === 0 ? [q[0] - half, q[1]] : [q[0], q[1] - half];
    out.push(c1, c2, q);
  }
  return out;
}

/** The points along cubic curve points `c`, a few to each piece. */
function drawnAlong(c: readonly MarkPoint[]): MarkPoint[] {
  const out: MarkPoint[] = [c[0] as MarkPoint];
  for (let i = 0; i + 3 < c.length; i += 3) {
    const [p0, p1, p2, p3] = c.slice(i, i + 4) as [MarkPoint, MarkPoint, MarkPoint, MarkPoint];
    for (let k = 1; k <= STEPS; k++) {
      const t = k / STEPS,
        u = 1 - t;
      const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
      out.push([
        w[0] * p0[0] + w[1] * p1[0] + w[2] * p2[0] + w[3] * p3[0],
        w[0] * p0[1] + w[1] * p1[1] + w[2] * p2[1] + w[3] * p3[1],
      ]);
    }
  }
  return out;
}

/**
 * The curve from the edge of box `a` through each of `given` to the edge of box `b`, moved `apart` pixels across the
 * way. Links between the same two boxes take the same way, so each is moved by its place among them.
 */
export function routedCurve(a: Placed, b: Placed, given: readonly MarkPoint[], axis: 0 | 1 = 0, apart = 0): Curve {
  const via = apart ? given.map((p): MarkPoint => (axis === 0 ? [p[0], p[1] + apart] : [p[0] + apart, p[1]])) : given;
  // each end leaves its box on the side facing its first bend, level with the box's middle
  const side = (box: Placed, toward: MarkPoint): MarkPoint =>
    axis === 0
      ? [box.x + Math.sign(toward[0] - box.x) * box.hw, box.y]
      : [box.x, box.y + Math.sign(toward[1] - box.y) * box.hh];
  const p0 = via.length ? side(a, via[0] as MarkPoint) : edgeOf(a, [b.x, b.y]),
    p3 = via.length ? side(b, via[via.length - 1] as MarkPoint) : edgeOf(b, [a.x, a.y]);
  // the curve as drawn, followed closely by short straight pieces, so words sit on the line and not on its chord
  const path: MarkPoint[] = [p0, ...via, p3];
  const drawn = drawnAlong(smooth(path, axis));
  const lengths = drawn
    .slice(1)
    .map((p, i) => Math.hypot(p[0] - (drawn[i] as MarkPoint)[0], p[1] - (drawn[i] as MarkPoint)[1]));
  const total = lengths.reduce((t, l) => t + l, 0) || 1;
  // the point a share `t` of the way along, and the way the path runs there
  const along = (t: number): [MarkPoint, MarkPoint] => {
    let left = t * total;
    for (let i = 0; i < lengths.length; i++) {
      const l = lengths[i] as number;
      const p = drawn[i] as MarkPoint,
        q = drawn[i + 1] as MarkPoint;
      if (left <= l || i === lengths.length - 1) {
        const u = l ? Math.min(1, left / l) : 0;
        return [
          [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u],
          [q[0] - p[0], q[1] - p[1]],
        ];
      }
      left -= l;
    }
    return [p3, [p3[0] - p0[0], p3[1] - p0[1]]];
  };
  return {
    at: (t) => along(t)[0],
    ends: [p0, p3],
    cubic(cutStart, cutEnd) {
      // the ends drawn in where an arrowhead takes their place, along the drawing's way, as the arrowhead points
      const ends = [
        inward(p0, path[1] as MarkPoint, cutStart, axis),
        inward(p3, path[path.length - 2] as MarkPoint, cutEnd, axis),
      ];
      return smooth([ends[0] as MarkPoint, ...via, ends[1] as MarkPoint], axis);
    },
    tipAt(atStart) {
      // the curve meets its box running the drawing's way, so its arrowhead points that way
      const tip = atStart ? p0 : p3;
      const from = (atStart ? path[1] : path[path.length - 2]) as MarkPoint;
      const d = tip[axis] - from[axis];
      const angle = axis === 0 ? (d >= 0 ? 0 : 180) : d >= 0 ? 90 : -90;
      return [tip, angle];
    },
    wordsAt(t, off) {
      // words sit just above the line where it runs across, and beside it where it runs up or down
      const [[x, y], [dx, dy]] = along(t);
      const long = Math.hypot(dx, dy) || 1;
      const flip = dx >= 0 ? -1 : 1;
      return [x - (dy / long) * off * flip, y + (dx / long) * off * flip];
    },
  };
}
