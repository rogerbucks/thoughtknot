// Spots a plug-in's layout gave (editor spec §68, layout_plugins), fitted to the drawing. A plug-in places things in its
// own units. So its spots are scaled until a link is about as long as ours. A thing it gave no spot, such as a folded
// group's box, sits in the middle of the things it links to. Host-free and pure.
import type { GraphShape } from '../types-shape.ts';

type Point = [number, number];

/** How many rounds a thing with no spot is moved to the middle of its linked things. */
const FILL_ROUNDS = 3;

/** Whether `placed` gives at least half the things of `shape` a spot: enough to lay it out by. */
export const placesMost = (shape: GraphShape, placed?: ReadonlyMap<string, Point>): boolean =>
  !!placed &&
  shape.things.length > 0 &&
  shape.things.filter((t) => placed.has(t.key)).length * 2 >= shape.things.length;

/**
 * Each thing of `shape` at the spot `placed` gives it, scaled so a link is `unit` long on average. With no link to
 * measure by, the spots are spread so each thing has about a link's room. A thing with no spot is put among its links.
 */
export function givenSpots(shape: GraphShape, placed: ReadonlyMap<string, Point>, unit: number): Map<string, Point> {
  const at = (k: string) => placed.get(k);
  let length = 0,
    n = 0;
  for (const l of shape.links) {
    const a = at(l.from),
      b = at(l.to);
    if (a && b && l.from !== l.to) [length, n] = [length + Math.hypot(a[0] - b[0], a[1] - b[1]), n + 1];
  }
  const ours = shape.things.map((t) => at(t.key)).filter((p): p is Point => !!p);
  const [x0, y0] = [Math.min(...ours.map((p) => p[0])), Math.min(...ours.map((p) => p[1]))];
  const room = Math.hypot(Math.max(...ours.map((p) => p[0])) - x0, Math.max(...ours.map((p) => p[1])) - y0);
  const scale = n && length ? (unit * n) / length : room ? (unit * Math.sqrt(ours.length)) / room : 1;
  const spots = new Map<string, Point>();
  for (const t of shape.things) {
    const p = at(t.key);
    if (p) spots.set(t.key, [(p[0] - x0) * scale, (p[1] - y0) * scale]);
  }
  const middle: Point = [0, 0];
  for (const p of spots.values())
    [middle[0], middle[1]] = [middle[0] + p[0] / spots.size, middle[1] + p[1] / spots.size];
  const missing = shape.things.filter((t) => !spots.has(t.key)).map((t) => t.key);
  for (const k of missing) spots.set(k, [...middle]);
  for (let round = 0; round < FILL_ROUNDS; round++)
    for (const k of missing) {
      const near = shape.links.flatMap((l) => (l.from === k ? [l.to] : l.to === k ? [l.from] : []));
      const ps = near.map((o) => (o === k ? undefined : spots.get(o))).filter((p): p is Point => !!p);
      if (ps.length)
        spots.set(k, [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length]);
    }
  return spots;
}
