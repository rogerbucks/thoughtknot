// The scene: layer L1 of the rendering spec (wiki/Rendering-spec.md; editor spec §73, render_scene). One tree of what a
// graph holds, far to near: subjects, areas, topics, then every item. Links are rolled up at each level and counted
// each way. So a road between two subjects knows how many links run along it in each direction.
//
// The levels come from the subject, area and topic each thing names (named-levels.ts) where any thing names one, else
// from the links (detail-levels.ts). The same graph gives the same scene whatever order it is written in. A scene has
// no positions and no colours: layout and marks add those. Host-free and pure.
import { detailLevels } from '../detail-levels.ts';
import type { DetailLevel } from '../detail-levels.ts';
import { namedLevels } from '../named-levels.ts';
import type { GraphShape } from '../types-shape.ts';
import type { DrawMark } from '../drawing-marks.ts';
import { word } from '../words.ts';

/** One place in the tree: a group at some level, or one item at the last. */
export interface SceneNode {
  key: string;
  name: string;
  /** How deep it sits: 0 for the farthest level, the last for an item. */
  depth: number;
  /** The node it sits in, one level out; none at depth 0. */
  parent?: string;
  /** The nodes inside it, one level in, in order. */
  children: string[];
  /** Every item inside it, at any depth; an item holds only itself. */
  items: string[];
}

/** The links between two nodes at one depth, counted each way: `forward` from `a` to `b`, `back` from `b` to `a`. */
export interface SceneRoad {
  a: string;
  b: string;
  forward: number;
  back: number;
  /** The kinds of link along it, such as RELATES, each once, in order. */
  types: string[];
}

/** A whole scene: the name of each depth, every node by key, the nodes at depth 0, and the roads at each depth. */
export interface Scene {
  depths: string[];
  nodes: Map<string, SceneNode>;
  roots: string[];
  /** The nodes at depth 0 in the order the note first names them, so colours follow the writer's order. */
  named: string[];
  roads: SceneRoad[][];
  /** For a type drawn at its own places: each subject's things, drawn on a patch of its colour (render-areas.ts). */
  areas?: SceneArea[];
  /** For a type that draws tiles or boxes round its things: its own marks, and its things' names (render-backdrop.ts). */
  backdrop?: { marks: DrawMark[]; names: Set<string> };
}

/** One subject's things, by the subject's key. */
export interface SceneArea {
  key: string;
  items: string[];
  /** How far its patch reaches round each thing, in the drawing's own units. */
  reach: number;
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The levels a scene is built from: the names things carry, else those found from the links. */
export const levelsOf = (shape: GraphShape): DetailLevel[] => namedLevels(shape) ?? detailLevels(shape);

/** The scene of `shape`. */
export function sceneOf(shape: GraphShape): Scene {
  const things = [...shape.things].sort((a, b) => byText(a.key, b.key));
  const levels = levelsOf({ ...shape, things });
  const groupDepths = levels.slice(0, -1);
  const last = groupDepths.length;
  const nodes = new Map<string, SceneNode>();
  // the group each item is in at each depth, far to near
  const pathOf = new Map<string, string[]>(things.map((t) => [t.key, []]));
  const named = new Map<string, string>();
  groupDepths.forEach((level, depth) => {
    for (const g of [...level.groups].sort((a, b) => byText(a.key, b.key))) {
      named.set(g.key, g.name);
      // a room never shows its parent's name: it is the part round the thing the parent is named after (Roger, 9 Nov)
      const name =
        g.parent !== undefined && named.get(g.parent) === g.name ? word('levels.around', { name: g.name }) : g.name;
      const node: SceneNode = { key: g.key, name, depth, children: [], items: [...g.things].sort(byText) };
      if (g.parent !== undefined) node.parent = g.parent;
      nodes.set(g.key, node);
      for (const t of g.things) pathOf.get(t)?.push(g.key);
    }
  });
  for (const t of things) {
    const path = pathOf.get(t.key) ?? [];
    const node: SceneNode = { key: t.key, name: t.text, depth: last, children: [], items: [t.key] };
    if (path.length) node.parent = path[path.length - 1];
    nodes.set(t.key, node);
  }
  for (const node of nodes.values()) if (node.parent !== undefined) nodes.get(node.parent)?.children.push(node.key);
  for (const node of nodes.values()) node.children.sort(byText);
  const roots = [...nodes.values()].filter((n) => n.depth === 0).map((n) => n.key);
  const first = [...new Set(shape.things.map((t) => pathOf.get(t.key)?.[0] ?? t.key))].filter((k) => roots.includes(k));
  return { depths: levels.map((l) => l.name), nodes, roots, named: first, roads: roadsOf(shape, pathOf, last) };
}

/** The roads at each depth: every link between two things, rolled up to the nodes each end sits in there. */
function roadsOf(shape: GraphShape, pathOf: Map<string, string[]>, last: number): SceneRoad[][] {
  const tallies = Array.from({ length: last + 1 }, () => new Map<string, SceneRoad>());
  for (const l of shape.links) {
    const from = pathOf.get(l.from),
      to = pathOf.get(l.to);
    if (!from || !to || l.from === l.to) continue;
    for (let depth = 0; depth <= last; depth++) {
      const x = depth === last ? l.from : from[depth],
        y = depth === last ? l.to : to[depth];
      if (x === undefined || y === undefined || x === y) continue;
      const [a, b] = byText(x, y) < 0 ? [x, y] : [y, x];
      const tally = tallies[depth] as Map<string, SceneRoad>;
      const road = tally.get(`${a}\n${b}`) ?? { a, b, forward: 0, back: 0, types: [] };
      if (x === a) road.forward++;
      else road.back++;
      if (!road.types.includes(l.type)) road.types = [...road.types, l.type].sort(byText);
      tally.set(`${a}\n${b}`, road);
    }
  }
  return tallies.map((t) => [...t.values()].sort((p, q) => byText(p.a, q.a) || byText(p.b, q.b)));
}
