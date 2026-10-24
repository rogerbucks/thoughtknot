// How each direct link bends, and the room the boxes are given (editor spec §25, untangle_direct). Roger, 24 Oct 2026:
// "Use a little more space to move in the diagram". He asked for links as near direct as can be, with slight curves.
// They should cross the fewest boxes and links.
//
// A link drawn straight may run through a box or cross another. Then the boxes are first spread a little apart from the
// middle of the drawing. A group moves whole, so it keeps its
// boxes. Then each lone link is tried at a few bends, each way, the slightest first, toward the middle of the drawing.
// A bend scores the boxes it runs through, the links it crosses, and how far it bends. Each link takes the bend that
// scores least, given the rest. A second round tries each again. Within a budget, so a big graph stays quick. The
// Python library does the same, step for step (graphspec/style/direct_bends.py). Host-free and pure.
import { curveOf } from './direct-curve.ts';
import type { Placed } from './direct-curve.ts';
import type { MarkPoint } from './plugin-diagrams.ts';

/** How much room a link keeps from a box it passes, in pixels. */
export const CLEARANCE = 10;
/** How far a lone link bows toward the middle of the drawing at the least, as a share of its length. */
export const GENTLE = 0.08;
/** How much further apart the boxes are spread from the middle of the drawing: a little more room. */
export const ROOM = 1.15;
/** The bends a lone link is tried at, each way, as shares of its length. */
const BENDS = [GENTLE, 0.16, 0.26, 0.4, 0.55];
/** How a bend is scored: for each box it runs through, each link it crosses, and how far it bends. */
const THROUGH = 4,
  CROSSED = 1,
  BENT = 2;
/** How many pieces a curve is cut into, to find what it runs through and crosses. */
const PIECES = 16;
/** The most looks at a piece of a curve in all, so a big graph stays quick. */
const WORK_MOST = 40_000_000;

/** A group's edges. */
export type Edges = { x0: number; y0: number; x1: number; y1: number };

/**
 * Spreads `boxes` apart from `middle` by ROOM. A box in a group moves with the outermost group it is in, as does that
 * group and every group inside it. Gives how far each group moved, by its id.
 */
export function spread(boxes: readonly Placed[], groups: ReadonlyMap<string, Edges>, middle: MarkPoint) {
  const within = (p: Edges, q: Edges) => p !== q && q.x0 <= p.x0 && q.y0 <= p.y0 && p.x1 <= q.x1 && p.y1 <= q.y1;
  const all = [...groups.values()];
  const by = new Map<Edges, MarkPoint>();
  for (const g of all) {
    // the outermost group round it: the one round it that no other is round
    const outer = all.find((q) => (q === g || within(g, q)) && !all.some((r) => within(q, r))) ?? g;
    const k = ROOM - 1;
    by.set(g, [((outer.x0 + outer.x1) / 2 - middle[0]) * k, ((outer.y0 + outer.y1) / 2 - middle[1]) * k]);
  }
  for (const b of boxes) {
    const d = b.inside && by.get(b.inside);
    b.x = d ? b.x + d[0] : middle[0] + (b.x - middle[0]) * ROOM;
    b.y = d ? b.y + d[1] : middle[1] + (b.y - middle[1]) * ROOM;
  }
  const moved = new Map<string, MarkPoint>();
  for (const [id, g] of groups) {
    const [dx, dy] = by.get(g) ?? [0, 0];
    Object.assign(g, { x0: g.x0 + dx, y0: g.y0 + dy, x1: g.x1 + dx, y1: g.y1 + dy });
    moved.set(id, [dx, dy]);
  }
  return moved;
}

/**
 * Whether some link of `pairs`, drawn straight from middle to middle, runs through a box or crosses another. Then the
 * boxes are given room. A big graph is taken to need it.
 */
export function crowded(pairs: readonly (readonly [Placed, Placed])[], boxes: readonly Placed[]): boolean {
  if (pairs.length * (pairs.length + boxes.length) * PIECES > WORK_MOST) return true;
  for (let i = 0; i < pairs.length; i++) {
    const [a, b] = pairs[i] as readonly [Placed, Placed];
    for (const o of boxes)
      if (o !== a && o !== b)
        for (let k = 1; k < PIECES; k++) {
          const x = a.x + ((b.x - a.x) * k) / PIECES,
            y = a.y + ((b.y - a.y) * k) / PIECES;
          if (Math.abs(x - o.x) < o.hw && Math.abs(y - o.y) < o.hh) return true;
        }
    for (let j = i + 1; j < pairs.length; j++) {
      const [c, d] = pairs[j] as readonly [Placed, Placed];
      if (c === a || c === b || d === a || d === b) continue;
      if (cut([a.x, a.y], [b.x, b.y], [c.x, c.y], [d.x, d.y])) return true;
    }
  }
  return false;
}

/** Which way `t` turns from the line `o` to `s`: 1, -1, or 0 on it. */
const turn = (o: MarkPoint, s: MarkPoint, t: MarkPoint) =>
  Math.sign((s[0] - o[0]) * (t[1] - o[1]) - (s[1] - o[1]) * (t[0] - o[0]));
/** Whether the piece `a` to `b` crosses the piece `c` to `d`. */
const cut = (a: MarkPoint, b: MarkPoint, c: MarkPoint, d: MarkPoint) =>
  turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0;

/** A link to bend: its ends, the way its gentle bend goes first, and its bow when that is fixed already. */
export interface ToBend {
  a: Placed;
  b: Placed;
  toward: number;
  fixed?: number;
}

/** The way toward the middle of the drawing, seen from the link from `a` to `b`; on the line itself, `side`. */
export function towardMiddle(a: Placed, b: Placed, side: number, middle: MarkPoint): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const across = (middle[0] - (a.x + b.x) / 2) * -dy + (middle[1] - (a.y + b.y) / 2) * dx;
  return Math.abs(across) < 1e-6 * (dx * dx + dy * dy) ? side : Math.sign(across);
}

/** How far each link of `links` bows, as a share of its length: the bend that scores least, given the rest. */
export function bends(links: readonly ToBend[], boxes: readonly Placed[]): number[] {
  const tries = links.map((l) => {
    if (l.fixed !== undefined) return [l.fixed];
    const away = aside(l.a, l.b, boxes);
    return [...(away ? [away] : []), ...BENDS.flatMap((s) => [l.toward * s, -l.toward * s])];
  });
  const cost = links.length * links.length * PIECES + links.length * boxes.length * BENDS.length * 2 * PIECES;
  const crossing = cost <= WORK_MOST;
  const lines = links.map((l, i) => pathOf(l.a, l.b, (tries[i] as number[])[0] as number));
  const bows = tries.map((t) => t[0] as number);
  for (let round = 0; round < (crossing ? 2 : 1); round++)
    links.forEach((l, i) => {
      const others = crossing ? lines.filter((_, j) => j !== i && (round > 0 || j < i) && apartFrom(l, links[j])) : [];
      let best = Infinity;
      for (const bow of tries[i] as number[]) {
        const path = pathOf(l.a, l.b, bow);
        const score =
          THROUGH * through(path, l, boxes) +
          CROSSED * others.filter((o) => crosses(path, o)).length +
          BENT * Math.abs(bow);
        if (score < best) {
          best = score;
          bows[i] = bow;
          lines[i] = path;
        }
      }
    });
  return bows;
}

/** Whether two links share no box, so a crossing between them is one to count. */
const apartFrom = (l: ToBend, m: ToBend | undefined) => !!m && l.a !== m.a && l.a !== m.b && l.b !== m.a && l.b !== m.b;

/** A curve as points along it, with the box round them. */
interface Path {
  points: MarkPoint[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The curve from `a` to `b` bowed by `bow`, cut into PIECES. */
function pathOf(a: Placed, b: Placed, bow: number): Path {
  const c = curveOf(a, b, bow);
  const points: MarkPoint[] = [];
  for (let k = 0; k <= PIECES; k++) points.push(c.at(k / PIECES));
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  return { points, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** How many boxes, other than its ends, the curve `p` of link `l` runs through. */
function through(p: Path, l: ToBend, boxes: readonly Placed[]): number {
  let n = 0;
  for (const o of boxes) {
    if (o === l.a || o === l.b) continue;
    if (o.x + o.hw < p.x0 || o.x - o.hw > p.x1 || o.y + o.hh < p.y0 || o.y - o.hh > p.y1) continue;
    if (p.points.some(([x, y]) => Math.abs(x - o.x) < o.hw && Math.abs(y - o.y) < o.hh)) n++;
  }
  return n;
}

/** Whether two curves cross. */
function crosses(p: Path, q: Path): boolean {
  if (p.x1 < q.x0 || q.x1 < p.x0 || p.y1 < q.y0 || q.y1 < p.y0) return false;
  for (let i = 0; i < PIECES; i++) {
    const a = p.points[i] as MarkPoint,
      b = p.points[i + 1] as MarkPoint;
    for (let j = 0; j < PIECES; j++) {
      const c = q.points[j] as MarkPoint,
        d = q.points[j + 1] as MarkPoint;
      if (cut(a, b, c, d)) return true;
    }
  }
  return false;
}

/**
 * How far the link from `a` to `b` bows, as a share of its length, to clear a box still in its way. It bows away from
 * the box, just far enough. Nothing in its way, it does not bow.
 */
export function aside(a: Placed, b: Placed, boxes: Iterable<Placed>): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    long = Math.hypot(dx, dy);
  if (long < 1e-6) return 0;
  const nx = -dy / long,
    ny = dx / long;
  let most = 0;
  for (const c of boxes) {
    if (c === a || c === b) continue;
    const t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / (long * long);
    if (t <= 0.05 || t >= 0.95) continue;
    const off = (c.x - a.x) * nx + (c.y - a.y) * ny;
    const reach = Math.abs(nx) * c.hw + Math.abs(ny) * c.hh + CLEARANCE;
    if (Math.abs(off) >= reach) continue;
    // a curve's middle moves half as far as its bend. So it bends twice what it must clear, away from the box. The bend
    // is scaled by how near the box is to the middle, where the bend is widest.
    const bend = (-Math.sign(off || 1) * 2 * (reach + Math.abs(off))) / (4 * t * (1 - t)) / long;
    if (Math.abs(bend) > Math.abs(most)) most = bend;
  }
  return Math.max(-0.6, Math.min(0.6, most));
}
