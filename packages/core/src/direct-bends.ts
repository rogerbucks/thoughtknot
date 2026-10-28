// How each direct link bends, and the room the boxes are given (editor spec §25, untangle_direct). Roger, 24 Oct 2026:
// "Use a little more space to move in the diagram". He asked for links as near direct as can be, with slight curves.
// They should cross the fewest boxes and links.
//
// A link drawn straight may run through a box or cross another. Then the boxes are first spread a little apart from the
// middle of the drawing. A group moves whole, so it keeps its
// boxes. Then each lone link is tried at a few bends, each way, the slightest first, toward the middle of the drawing.
// A bend scores the boxes it runs through, the links it crosses, and how far it bends. Each link takes the bend that
// scores least, given the rest. A second round tries each again. Each pass counts its looks against its budget and
// stops there, so a big graph stays quick (layout-work.ts). The Python library does the same, step for step
// (graphspec/style/direct_bends.py). Host-free and pure.
import { curveOf } from './direct-curve.ts';
import type { Placed } from './direct-curve.ts';
import type { MarkPoint } from './plugin-diagrams.ts';
import type { DrawMark } from './drawing-marks.ts';
import { CROSSINGS_PLANNED, Work, WORK_MOST, linkWork } from './layout-work.ts';

/** How much room a link keeps from a box it passes, in pixels. */
export const CLEARANCE = 10;
/** How far a lone link bows toward the middle of the drawing at the least, as a share of its length. */
export const GENTLE = 0.08;
/** How much further apart the boxes are spread from the middle of the drawing: a little more room. */
export const ROOM = 1.15;
/** The bends a lone link is tried at, each way, as shares of its length. */
const BENDS = [GENTLE, 0.16, 0.26, 0.4, 0.55];
/** The wider bends a bundle is tried at too, so it can go round a whole group in its way. */
const WIDE = [0.75, 1];
/** How a bend is scored: for each box it runs through, each link it crosses, and how far it bends. */
const THROUGH = 4,
  CROSSED = 1,
  BENT = 2;
/** How many pieces a curve is cut into, to find what it runs through and crosses. */
const PIECES = 16;

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
 * boxes are given room. Each look at a piece of a link by a box counts as work, as does each pair of links. A graph
 * that spends the budget before an answer is taken to need room.
 */
export function crowded(
  pairs: readonly (readonly [Placed, Placed])[],
  boxes: readonly Placed[],
  work = new Work(WORK_MOST.crowded),
): boolean {
  for (let i = 0; i < pairs.length; i++) {
    if (!work.take(boxes.length * PIECES + pairs.length - i - 1)) return true;
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
  /** More it goes round, as it does boxes: a bundle goes round the groups between its two (trunkEnds). */
  avoid?: readonly Placed[];
}

/** The way toward the middle of the drawing, seen from the link from `a` to `b`; on the line itself, `side`. */
export function towardMiddle(a: Placed, b: Placed, side: number, middle: MarkPoint): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const across = (middle[0] - (a.x + b.x) / 2) * -dy + (middle[1] - (a.y + b.y) / 2) * dx;
  return Math.abs(across) < 1e-6 * (dx * dx + dy * dy) ? side : Math.sign(across);
}

/**
 * How far each link of `links` bows, as a share of its length: the bend that scores least, given the rest. Each look
 * at a box counts against `work.bends`, and each pair of links compared against `work.crossings`. Links planned to
 * take too long (CROSSINGS_PLANNED), or met once the crossings' budget is spent, are scored by the boxes alone. Once
 * the bends' budget is spent, each link left keeps the bend it was first given.
 */
export function bends(links: readonly ToBend[], boxes: readonly Placed[], work = linkWork()): number[] {
  const near = (l: ToBend) => (l.avoid ? [...boxes, ...l.avoid] : boxes);
  const tries = links.map((l) => {
    if (l.fixed !== undefined) return [l.fixed];
    const pool = near(l);
    const away = work.bends.take(pool.length) ? aside(l.a, l.b, pool) : 0;
    const each = l.avoid ? [...BENDS, ...WIDE] : BENDS;
    return [...(away ? [away] : []), ...each.flatMap((s) => [l.toward * s, -l.toward * s])];
  });
  let crossing = links.length * (links.length + boxes.length * BENDS.length * 2) * PIECES <= CROSSINGS_PLANNED;
  const lines = links.map((l, i) => pathOf(l.a, l.b, (tries[i] as number[])[0] as number));
  const bows = tries.map((t) => t[0] as number);
  for (let round = 0; round < 2; round++)
    for (let i = 0; i < links.length; i++) {
      const l = links[i] as ToBend,
        each = tries[i] as number[],
        pool = near(l);
      crossing &&= work.crossings.take(lines.length);
      if (round > 0 && !crossing) return bows;
      const others = crossing ? lines.filter((_, j) => j !== i && (round > 0 || j < i) && apartFrom(l, links[j])) : [];
      crossing &&= work.crossings.take(each.length * others.length);
      if (!crossing) others.length = 0;
      if (!work.bends.take(each.length * pool.length)) return bows;
      let best = Infinity;
      for (const bow of each) {
        const path = pathOf(l.a, l.b, bow);
        const score =
          THROUGH * through(path, l, pool) +
          CROSSED * others.filter((o) => crosses(path, o)).length +
          BENT * Math.abs(bow);
        if (score < best) {
          best = score;
          bows[i] = bow;
          lines[i] = path;
        }
      }
    }
  return bows;
}

/** Whether two links share no box, so a crossing between them is one to count. */
const apartFrom = (l: ToBend, m: ToBend | undefined) => !!m && l.a !== m.a && l.a !== m.b && l.b !== m.a && l.b !== m.b;

/** A curve as points along it, with the box round them, and the box round each piece (x0, y0, x1, y1 in turn). */
interface Path {
  points: MarkPoint[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  pieces: Float64Array;
}

/** The curve from `a` to `b` bowed by `bow`, cut into PIECES. */
function pathOf(a: Placed, b: Placed, bow: number): Path {
  const c = curveOf(a, b, bow);
  const points: MarkPoint[] = [];
  for (let k = 0; k <= PIECES; k++) points.push(c.at(k / PIECES));
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const pieces = new Float64Array(PIECES * 4);
  for (let i = 0; i < PIECES; i++) {
    const [ax, ay] = points[i] as MarkPoint,
      [bx, by] = points[i + 1] as MarkPoint;
    pieces.set([Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)], i * 4);
  }
  return { points, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), pieces };
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

/**
 * Whether two curves cross. Two pieces whose boxes are apart cannot cross. So only pieces whose boxes meet are tested.
 * The answer is the same as testing every pair, in a small share of the time.
 */
function crosses(p: Path, q: Path): boolean {
  if (p.x1 < q.x0 || q.x1 < p.x0 || p.y1 < q.y0 || q.y1 < p.y0) return false;
  const ps = p.pieces,
    qs = q.pieces;
  for (let i = 0; i < PIECES; i++) {
    const i4 = i * 4;
    const px0 = ps[i4] as number,
      py0 = ps[i4 + 1] as number,
      px1 = ps[i4 + 2] as number,
      py1 = ps[i4 + 3] as number;
    if (px1 < q.x0 || q.x1 < px0 || py1 < q.y0 || q.y1 < py0) continue;
    const a = p.points[i] as MarkPoint,
      b = p.points[i + 1] as MarkPoint;
    for (let j = 0; j < PIECES; j++) {
      const j4 = j * 4;
      if (
        px1 < (qs[j4] as number) ||
        (qs[j4 + 2] as number) < px0 ||
        py1 < (qs[j4 + 1] as number) ||
        (qs[j4 + 3] as number) < py0
      )
        continue;
      if (cut(a, b, q.points[j] as MarkPoint, q.points[j + 1] as MarkPoint)) return true;
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

/** A trunk's two ends, as the layout source names them (fold-source.ts): its number, and which end. */
const TRUNK_END = /^trunk: (\d+) (in|out)$/;

/**
 * Each trunk's two ends moved to beside the groups it joins (untangle_found_groups). The end its links come in to sits
 * just outside the group they come from, on the side facing the group they go to. The other end sits the same way by
 * the group they go to. So a bundle runs straight from group to group, never out into empty space. A group is the one
 * its boxes sit in, or the box round them all.
 */
export function trunkEnds(boxes: ReadonlyMap<string, Placed>, links: readonly { from?: string; to?: string }[]): void {
  // the boxes each thing's links come from, and go to, found in one pass over the links
  const ends = { in: new Map<string, Placed[]>(), out: new Map<string, Placed[]>() };
  const add = (to: Map<string, Placed[]>, key = '', b?: Placed) =>
    b && (to.get(key) ?? to.set(key, []).get(key))?.push(b);
  for (const l of links) {
    add(ends.in, l.to, boxes.get(l.from ?? ''));
    add(ends.out, l.from, boxes.get(l.to ?? ''));
  }
  const regionOf = (key: string, end: string): Edges | undefined => {
    const near = (end === 'in' ? ends.in : ends.out).get(key) ?? [];
    if (!near.length) return undefined;
    const first = near[0]?.inside;
    if (first && near.every((b) => b.inside === first)) return first;
    return {
      x0: Math.min(...near.map((b) => b.x - b.hw)),
      y0: Math.min(...near.map((b) => b.y - b.hh)),
      x1: Math.max(...near.map((b) => b.x + b.hw)),
      y1: Math.max(...near.map((b) => b.y + b.hh)),
    };
  };
  const spots: [Placed, number, number][] = [];
  for (const [key, p] of boxes) {
    const m = TRUNK_END.exec(key);
    if (!m) continue;
    const other = m[2] === 'in' ? 'out' : 'in';
    const here = regionOf(key, m[2] ?? ''),
      there = regionOf(`trunk: ${m[1]} ${other}`, other);
    if (!here || !there) continue;
    const cx = (here.x0 + here.x1) / 2,
      cy = (here.y0 + here.y1) / 2;
    const dx = (there.x0 + there.x1) / 2 - cx,
      dy = (there.y0 + there.y1) / 2 - cy;
    const long = Math.hypot(dx, dy) || 1;
    const ux = dx / long,
      uy = dy / long;
    const reach =
      Math.min(
        ux === 0 ? Infinity : (here.x1 - here.x0) / 2 / Math.abs(ux),
        uy === 0 ? Infinity : (here.y1 - here.y0) / 2 / Math.abs(uy),
      ) + CLEARANCE;
    spots.push([p, cx + ux * reach, cy + uy * reach]);
  }
  for (const [p, x, y] of spots) {
    p.x = x;
    p.y = y;
    delete p.inside;
  }
}

/** The room a group keeps round its things, in pixels, once it hugs them. */
export const HUG = 8;

/**
 * Each group of `groups` drawn just round what it holds, never bigger than it was (untangle_group_hug). It holds its
 * things of `boxes` and the groups inside it, HUG apart. `heads` gives, by a group's id, the room its name takes above its
 * things and the least width that name needs. The smallest group goes first, so a group round it hugs it as drawn.
 */
export function hug(
  boxes: Iterable<Placed>,
  groups: ReadonlyMap<string, Edges>,
  heads: ReadonlyMap<string, readonly [number, number]>,
): void {
  const within = (p: Edges, q: Edges) => p !== q && q.x0 <= p.x0 && q.y0 <= p.y0 && p.x1 <= q.x1 && p.y1 <= q.y1;
  const all = [...boxes];
  const area = (g: Edges) => (g.x1 - g.x0) * (g.y1 - g.y0);
  const order = [...groups].sort(([, p], [, q]) => area(p) - area(q));
  const inner = new Map(order.map(([, g]) => [g, order.filter(([, c]) => within(c, g)).map(([, c]) => c)]));
  for (const [id, g] of order) {
    const held: Edges[] = [
      ...all
        .filter((b) => b.inside === g)
        .map((b) => ({ x0: b.x - b.hw, y0: b.y - b.hh, x1: b.x + b.hw, y1: b.y + b.hh })),
      ...(inner.get(g) ?? []),
    ];
    if (!held.length) continue;
    const [top, least] = heads.get(id) ?? [HUG, 0];
    let x0 = Math.max(g.x0, Math.min(...held.map((e) => e.x0)) - HUG),
      x1 = Math.min(g.x1, Math.max(...held.map((e) => e.x1)) + HUG);
    // wide enough for its name, about its middle, as far as it was wide
    const short = least - (x1 - x0);
    if (short > 0) {
      x0 = Math.max(g.x0, x0 - short / 2);
      x1 = Math.min(g.x1, x0 + least);
    }
    Object.assign(g, {
      x0,
      y0: Math.max(g.y0, Math.min(...held.map((e) => e.y0)) - top),
      x1,
      y1: Math.min(g.y1, Math.max(...held.map((e) => e.y1)) + HUG),
    });
  }
}

/** The mark `m` of a group drawn at `was`, moved to where it is drawn `now`: its outline, or its name, kept centred. */
export function hugged(m: DrawMark, was: Edges, now: Edges): DrawMark {
  const midWas = (was.x0 + was.x1) / 2,
    midNow = (now.x0 + now.x1) / 2,
    upWas = (was.y0 + was.y1) / 2;
  if (m.kind === 'label') return { ...m, x: m.x + midNow - midWas, y: m.y + now.y0 - was.y0 };
  if (m.kind !== 'group') return m;
  // each point of its outline keeps its place from the nearest corner
  const at = ([x, y]: MarkPoint): MarkPoint => [
    x < midWas ? x + now.x0 - was.x0 : x + now.x1 - was.x1,
    y < upWas ? y + now.y0 - was.y0 : y + now.y1 - was.y1,
  ];
  const outline = m.outline && { ...m.outline, points: m.outline.points.map(at) };
  return {
    ...m,
    x: now.x0,
    y: now.y0,
    width: now.x1 - now.x0,
    height: now.y1 - now.y0,
    ...(outline ? { outline } : {}),
  };
}
