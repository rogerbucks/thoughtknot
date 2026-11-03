// The links between clouds, drawn as roads (editor spec §68, level_roads). Roger, 3 Nov 2026: far out, links merge into
// roads that run all the way to the other cloud, one lane each way. Roads go round clouds they do not belong to. Each
// end has a gate that says where it goes, and its arrow says which way the links run ("→ Money · 3").
//
// At a level of groups, every link between two things in different groups counts toward the road between those
// groups. A road leaves each cloud at its port, the point where the line between their middles crosses the cloud's box.
// Where the line would cross a third cloud, it bends round that cloud. A road with links both ways has two lanes, side
// by side. Its width grows with how many links it carries. Links never vanish: each one is in exactly one road. Nothing
// moves. Host-free and pure.
import type { DetailLevel } from './detail-levels.ts';
import type { Cloud, Rect } from './level-clouds.ts';
import { word } from './words.ts';

type Point = [number, number];

/** One lane of a road: its path, which way it runs, and how many links it carries. */
export interface Lane {
  d: string;
  from: string;
  to: string;
  count: number;
}

/** A gate at a road's end: where its words go, and what they say. */
export interface Gate {
  x: number;
  y: number;
  text: string;
}

/** A road between two clouds: their keys, its lanes, its gates, and how many links it carries in all. */
export interface Road {
  a: string;
  b: string;
  lanes: Lane[];
  gates: Gate[];
  count: number;
}

const middle = (r: Rect): Point => [(r.left + r.right) / 2, (r.top + r.bottom) / 2];
const round = (n: number): number => Math.round(n * 10) / 10;

/** Where the line from the middle of `r` toward `to` leaves `r`. */
export function portOf(r: Rect, to: Point): Point {
  const [cx, cy] = middle(r),
    dx = to[0] - cx,
    dy = to[1] - cy;
  const hw = (r.right - r.left) / 2,
    hh = (r.bottom - r.top) / 2;
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity, 1);
  return [cx + dx * t, cy + dy * t];
}

/** Whether the line from `p` to `q` crosses `r`, sampled along its length. */
function crosses(p: Point, q: Point, r: Rect): boolean {
  for (let i = 1; i < 20; i++) {
    const x = p[0] + ((q[0] - p[0]) * i) / 20,
      y = p[1] + ((q[1] - p[1]) * i) / 20;
    if (x > r.left && x < r.right && y > r.top && y < r.bottom) return true;
  }
  return false;
}

/** The bend that takes the line from `p` to `q` round `r`: the middle pushed out past `r`, on the side it is nearer. */
function bendRound(p: Point, q: Point, r: Rect): Point {
  const m: Point = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2],
    c = middle(r);
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  let nx = -(q[1] - p[1]) / len,
    ny = (q[0] - p[0]) / len;
  // out on the side of the line away from the cloud's middle
  if (nx * (m[0] - c[0]) + ny * (m[1] - c[1]) < 0) [nx, ny] = [-nx, -ny];
  const reach = Math.hypot(r.right - r.left, r.bottom - r.top) / 2;
  const off = reach + Math.abs(nx * (c[0] - m[0]) + ny * (c[1] - m[1]));
  // a curve's middle sits halfway to its control point, so the control point goes twice as far
  return [m[0] + nx * off * 2, m[1] + ny * off * 2];
}

/** The path from `p` to `q` through `bend`, if any, moved sideways by `side` (one lane of two). */
function lanePath(p: Point, q: Point, bend: Point | null, side: number): string {
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1,
    nx = (-(q[1] - p[1]) / len) * side,
    ny = ((q[0] - p[0]) / len) * side;
  const s = (pt: Point) => `${round(pt[0] + nx)},${round(pt[1] + ny)}`;
  return bend ? `M${s(p)} Q${s(bend)} ${s(q)}` : `M${s(p)} L${s(q)}`;
}

/** The arrow at a gate, from its own cloud: → links only go out, ← only come in, ⇄ both (level_arrows). */
const arrowOf = (out: number, into: number): string => (out && into ? '⇄' : out ? '→' : '←');

/**
 * The roads between the clouds of level `at`, from the drawing's `links`. Two lanes sit `lane` apart. A gate sits
 * `gate` out from each port, saying where the road goes and how many links it carries.
 */
export function roadsAt(
  levels: readonly DetailLevel[],
  at: number,
  links: readonly { from: string; to: string }[],
  clouds: readonly Cloud[],
  lane: number,
  gate: number,
): Road[] {
  const groupOf = new Map((levels[at]?.groups ?? []).flatMap((g) => g.things.map((t) => [t, g.key] as const)));
  const byKey = new Map(clouds.map((c) => [c.key, c]));
  const counts = new Map<string, { a: string; b: string; ab: number; ba: number }>();
  for (const l of links) {
    const f = groupOf.get(l.from),
      t = groupOf.get(l.to);
    if (!f || !t || f === t || !byKey.has(f) || !byKey.has(t)) continue;
    const [a, b] = f < t ? [f, t] : [t, f];
    const road = counts.get(`${a}\n${b}`) ?? { a, b, ab: 0, ba: 0 };
    if (f === a) road.ab++;
    else road.ba++;
    counts.set(`${a}\n${b}`, road);
  }
  return [...counts.values()].map(({ a, b, ab, ba }) => {
    const ca = byKey.get(a) as Cloud,
      cb = byKey.get(b) as Cloud;
    const p = portOf(ca.box, middle(cb.box)),
      q = portOf(cb.box, middle(ca.box));
    const other = clouds.find((c) => c.key !== a && c.key !== b && crosses(p, q, c.box));
    const bend = other ? bendRound(p, q, other.box) : null;
    const both = ab > 0 && ba > 0;
    const lanes: Lane[] = [];
    if (ab) lanes.push({ d: lanePath(p, q, bend, both ? lane / 2 : 0), from: a, to: b, count: ab });
    if (ba) lanes.push({ d: lanePath(q, p, bend, both ? lane / 2 : 0), from: b, to: a, count: ba });
    const toward = (from: Point, to: Point): Point => {
      const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
      return [from[0] + ((to[0] - from[0]) / len) * gate, from[1] + ((to[1] - from[1]) / len) * gate];
    };
    const count = ab + ba;
    const gates: Gate[] = [
      { ...xy(toward(p, bend ?? q)), text: word('levels.gate', { arrow: arrowOf(ab, ba), name: cb.name, count }) },
      { ...xy(toward(q, bend ?? p)), text: word('levels.gate', { arrow: arrowOf(ba, ab), name: ca.name, count }) },
    ];
    return { a, b, lanes, gates, count };
  });
}

const xy = ([x, y]: Point): { x: number; y: number } => ({ x: round(x), y: round(y) });
