// Rooms first: layer L2 of the rendering spec (wiki/Rendering-spec.md; editor spec §73, render_rooms). Each group is a
// round room. Its children sit inside it on a ring, and its items in a sunflower spiral, as the approved mockups draw
// them. The rooms at the top sit in rows, the most linked side by side. Siblings round a ring are put in the same
// order, so a road between neighbours stays short.
//
// It works from the inside out. An item is a dot of ITEM_GAP across. A room holds its children with room to spare. A
// ring is as wide as its children need. So the same scene always gives the same places, and only a change to the
// scene's structure moves anything (Roger: nodes stay put). Host-free and pure.
import type { Scene, SceneNode, SceneRoad } from './render-scene.ts';

/** Where a node sits, in the drawing's own pixels: its middle, and the radius of its room (half a dot for an item). */
export interface Spot {
  x: number;
  y: number;
  r: number;
}

/** The distance between two items side by side in a room. */
export const ITEM_GAP = 17;
/** The room left between two rooms on a ring, and round the edge of a room, in pixels. */
export const ROOM_GAP = 24;
/** The golden angle, which spreads a sunflower's seeds evenly. */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** Where a ring starts, as the mockup's rings do: a little past the top. */
const RING_START = -Math.PI / 2 + 0.3;

/** The places of every node of `scene`, by key. */
export function roomsOf(scene: Scene): Map<string, Spot> {
  const size = new Map<string, number>(),
    local = new Map<string, Spot>();
  const linked = linkWeights(scene.roads);
  // inside out: each node's radius, and its children's places round its middle
  const deepestFirst = [...scene.nodes.values()].sort((a, b) => b.depth - a.depth);
  for (const node of deepestFirst) size.set(node.key, arrange(node, scene, size, local, linked));
  // the top rooms in rows; then each child's place is its parent's place plus its own
  const spots = new Map<string, Spot>();
  const roots = chain(scene.roots, linked);
  const cell = 2 * Math.max(0, ...roots.map((k) => size.get(k) ?? 0)) + ROOM_GAP * 2;
  const columns = Math.max(1, Math.ceil(Math.sqrt(roots.length * 1.5)));
  roots.forEach((key, i) => {
    const row = Math.floor(i / columns),
      col = row % 2 ? columns - 1 - (i % columns) : i % columns;
    spots.set(key, { x: col * cell + cell / 2, y: row * cell + cell / 2, r: size.get(key) ?? 0 });
  });
  const shallowFirst = [...scene.nodes.values()].sort((a, b) => a.depth - b.depth);
  for (const node of shallowFirst) {
    const at = spots.get(node.key);
    if (!at) continue;
    for (const child of node.children) {
      const offset = local.get(child) as Spot;
      spots.set(child, { x: at.x + offset.x, y: at.y + offset.y, r: offset.r });
    }
  }
  return spots;
}

/**
 * Places `node`'s children round its middle, in `local`, and returns its radius. Items sit in a sunflower spiral, the
 * first in the middle. Rooms sit on a ring as wide as they need, linked neighbours side by side.
 */
function arrange(
  node: SceneNode,
  scene: Scene,
  size: Map<string, number>,
  local: Map<string, Spot>,
  linked: Map<string, number>,
): number {
  const kids = node.children;
  if (!kids.length) return ITEM_GAP / 2;
  const leaves = kids.every((k) => !scene.nodes.get(k)?.children.length);
  if (leaves) {
    let far = 0;
    kids.forEach((k, m) => {
      const r = ITEM_GAP * Math.sqrt(m + (m ? 0.6 : 0)),
        a = m * GOLDEN;
      local.set(k, { x: Math.cos(a) * r, y: Math.sin(a) * r, r: ITEM_GAP / 2 });
      far = Math.max(far, r);
    });
    return far + ITEM_GAP / 2 + ROOM_GAP / 2;
  }
  const order = chain(kids, linked);
  const radii = order.map((k) => size.get(k) ?? ITEM_GAP / 2);
  if (order.length === 1) {
    local.set(order[0] as string, { x: 0, y: 0, r: radii[0] as number });
    return (radii[0] as number) + ROOM_GAP;
  }
  // a ring whose circumference holds every child with a gap between, and never so small that two children overlap
  const around = radii.reduce((s, r) => s + 2 * r + ROOM_GAP, 0);
  const biggest = Math.max(...radii);
  const ring = Math.max(around / (2 * Math.PI), biggest + ROOM_GAP / 2);
  let angle = RING_START;
  order.forEach((k, i) => {
    const r = radii[i] as number;
    angle += ((r + ROOM_GAP / 2) / around) * 2 * Math.PI;
    local.set(k, { x: Math.cos(angle) * ring, y: Math.sin(angle) * ring, r });
    angle += ((r + ROOM_GAP / 2) / around) * 2 * Math.PI;
  });
  return ring + biggest + ROOM_GAP;
}

/** How many links join each pair of nodes, at any depth, keyed by the pair. */
function linkWeights(roads: readonly SceneRoad[][]): Map<string, number> {
  const weights = new Map<string, number>();
  for (const at of roads) for (const r of at) weights.set(`${r.a}\n${r.b}`, r.forward + r.back);
  return weights;
}

/** How many links join `x` and `y`. */
const weightOf = (linked: Map<string, number>, x: string, y: string): number =>
  linked.get(x < y ? `${x}\n${y}` : `${y}\n${x}`) ?? 0;

/**
 * `keys` in a row where each is next to the one it links to most. Start from the most linked pair. Then add whichever
 * key left links most to either end. Ties go to the key first in order, so the row is always the same.
 */
export function chain(keys: readonly string[], linked: Map<string, number>): string[] {
  const left = [...keys].sort();
  if (left.length < 3) return left;
  let best: [string, string] = [left[0] as string, left[1] as string],
    most = -1;
  for (let i = 0; i < left.length; i++)
    for (let j = i + 1; j < left.length; j++) {
      const w = weightOf(linked, left[i] as string, left[j] as string);
      if (w > most) [most, best] = [w, [left[i] as string, left[j] as string]];
    }
  const row = [...best];
  const rest = left.filter((k) => !best.includes(k));
  while (rest.length) {
    let pick = 0,
      atEnd = true,
      top = -1;
    rest.forEach((k, i) => {
      const end = weightOf(linked, row[row.length - 1] as string, k),
        start = weightOf(linked, row[0] as string, k);
      if (end > top) [top, pick, atEnd] = [end, i, true];
      if (start > top) [top, pick, atEnd] = [start, i, false];
    });
    const [k] = rest.splice(pick, 1) as [string];
    if (atEnd) row.push(k);
    else row.unshift(k);
  }
  return row;
}
