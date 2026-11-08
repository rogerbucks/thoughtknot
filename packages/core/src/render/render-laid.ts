// Where each thing sits in a diagram type other than Network, for the new stage. It is phase P4 of
// wiki/Rendering-spec.md (editor spec §73, render_every_type). Each type keeps its own layout: Force pulls linked
// things together, Radial puts rings round the busiest thing, and Tree puts rows from each root down. The stage then
// draws, zooms, names and colours them as it does a network. So every type looks and moves alike.
//
// Places are in the drawing's own pixels, a dot ITEM_GAP across. The same graph always gives the same places, so
// nothing moves unless the graph does (Roger: nodes stay put). Host-free and pure.
import type { GraphShape } from '../types-shape.ts';
import { forceLayout } from '../view-types/force-view.ts';
import { busiest } from '../view-types/ego-view.ts';
import { tidyTree } from '../layouts/tidy-tree.ts';
import { layeredLayout } from '../layouts/layered.ts';
import { VIEW_DRAWERS } from '../view-types/view-types.ts';
import { densityPlaces } from '../view-types/density-view.ts';
import type { DiagramPlan } from '../note-reading.ts';
import { timelineLaid } from './render-timeline.ts';
import { lanesLaid } from './render-lanes.ts';
import type { DrawMark } from '../drawing-marks.ts';
import { ITEM_GAP } from './render-rooms.ts';
import type { Spot } from './render-rooms.ts';
import type { Scene, SceneArea, SceneNode } from './render-scene.ts';
import type { OwnColour } from './render-look.ts';
import { roadsAmong, subjectColour, type Ego } from './render-ego.ts';

/** The diagram types whose places come from here. */
export const LAID_TYPES = [
  'force',
  'radial',
  'tree',
  'flow',
  'chord',
  'centroid',
  'pole',
  'treemap',
  'containment',
  'block',
  'grid',
  'hive',
  'arc',
  'map',
  'matrix',
  'density',
  'plan',
  'timeline',
  'lanes',
] as const;
/** One of them. */
export type LaidType = (typeof LAID_TYPES)[number];

/** A thing's middle, in the drawing's own pixels. */
export interface Place {
  x: number;
  y: number;
}

/** How far apart one link holds two things in Force, in pixels: room for a name between them. */
const FORCE_UNIT = ITEM_GAP * 9;
/** How far apart two rings sit in Radial. */
const RING_GAP = ITEM_GAP * 9;
/** The room one thing takes round a ring, so names on a crowded ring keep apart. */
const RING_ROOM = ITEM_GAP * 8;
/** The room a thing takes in a row of Tree: its dot and a name under it. */
const TREE_BOX: [number, number] = [ITEM_GAP * 7, ITEM_GAP * 2];
/** The room left between two parts of a graph that do not link, side by side. */
const PART_GAP = ITEM_GAP * 4;

/** Whether `type` is one whose places come from here. */
export const isLaid = (type: string): type is LaidType => (LAID_TYPES as readonly string[]).includes(type);

/** Where each thing of `shape` sits when drawn as `type`, by key. */
export function placesOf(type: LaidType, shape: GraphShape, plan?: DiagramPlan): Map<string, Place> {
  if (type === 'timeline') return timelineLaid(shape, plan).places;
  if (type === 'lanes') return lanesLaid(shape).places;
  if (type === 'force') return scaled(forceLayout(shape), FORCE_UNIT);
  if (type === 'radial') return radial(shape);
  if (type === 'flow') return rows(shape);
  if (type !== 'tree') return drawn(type, shape);
  return tree(shape);
}

/** The shape a card shows best: a little wider than tall. */
const CARD_ASPECT = 1.5;

/**
 * Tree: rows from each root, top down or left to right, whichever is nearer a card's shape. A wide shallow tree
 * reads better on its side. A graph that is not a tree is put in rows by its links.
 */
function tree(shape: GraphShape): Map<string, Place> {
  const sizes = new Map(shape.things.map((t) => [t.key, TREE_BOX] as const));
  const ways = (['TB', 'LR'] as const).map((way) =>
    scaled(tidyTree(shape, sizes, way)?.spots ?? layeredLayout(shape, sizes, way), 1),
  );
  const off = (p: Map<string, Place>): number => {
    const xs = [...p.values()].map((q) => q.x),
      ys = [...p.values()].map((q) => q.y);
    const w = Math.max(...xs) - Math.min(...xs) + TREE_BOX[0],
      h = Math.max(...ys) - Math.min(...ys) + TREE_BOX[1];
    return Math.abs(Math.log(w / h / CARD_ASPECT));
  };
  const [down, across] = ways as [Map<string, Place>, Map<string, Place>];
  return off(across) < off(down) ? across : down;
}

/** Flow: things in rows left to right, as their links run. */
function rows(shape: GraphShape): Map<string, Place> {
  const sizes = new Map(shape.things.map((t) => [t.key, TREE_BOX] as const));
  return scaled(layeredLayout(shape, sizes, 'LR'), 1);
}

/** The room a drawn view is given: wide enough for a name beside each thing. */
const ROOM_EACH = ITEM_GAP * 9;

/** The types drawn with tiles or boxes round their things: the stage keeps those as a backdrop. */
const TILED: ReadonlySet<string> = new Set([
  'treemap',
  'containment',
  'block',
  'grid',
  'hive',
  'arc',
  'map',
  'matrix',
  'density',
  'plan',
]);
/** A type the view's own drawing places. */
type Drawn = Exclude<LaidType, 'force' | 'radial' | 'tree' | 'flow' | 'timeline' | 'lanes'>;

/** The marks a view draws `shape` with, in room enough for a name beside each thing. */
function viewMarks(type: Drawn, shape: GraphShape): DrawMark[] {
  return VIEW_DRAWERS[type]({ shape, space: spaceFor(shape) });
}

/** The square a drawn view is given for `shape`. */
function spaceFor(shape: GraphShape): { width: number; height: number } {
  const side = Math.max(600, Math.sqrt(shape.things.length) * ROOM_EACH);
  return { width: side, height: side };
}

/**
 * Each thing where the view's own drawing puts its card or tile. So the shape a reader knows from that view is
 * kept: a ring, clusters, poles, tiles or rows.
 */
function drawn(type: Drawn, shape: GraphShape, marks = viewMarks(type, shape)): Map<string, Place> {
  const keys = new Set(shape.things.map((t) => t.key));
  const out = new Map<string, Place>();
  if (type === 'density')
    for (const [k, [x, y]] of densityPlaces({ shape, space: spaceFor(shape) })) out.set(k, { x, y });
  if (type === 'matrix') return diagonal(marks, keys);
  for (const m of marks)
    if (m.kind === 'box' && m.of && keys.has(m.of) && !out.has(m.of))
      out.set(m.of, { x: m.x + m.width / 2, y: m.y + m.height / 2 });
  // a thing the view draws no box for sits at its own words, as Plan's things with no dates do
  for (const m of marks)
    if (m.kind === 'label' && m.of && keys.has(m.of) && !out.has(m.of)) out.set(m.of, { x: m.x, y: m.y });
  return out;
}

/** Matrix: each thing on its own cell, where its row crosses its column, so its row and column stay named. */
function diagonal(marks: readonly DrawMark[], keys: ReadonlySet<string>): Map<string, Place> {
  const rows = new Map<string, number>(),
    columns = new Map<string, number>();
  for (const m of marks)
    if (m.kind === 'label' && m.of && keys.has(m.of)) {
      if (m.id.endsWith('.row')) rows.set(m.of, m.y - m.size / 3);
      else if (m.id.endsWith('.column')) columns.set(m.of, m.x);
    }
  const out = new Map<string, Place>();
  for (const [k, y] of rows) out.set(k, { x: columns.get(k) ?? 0, y });
  return out;
}

/** `places` as pixels, `unit` to one of theirs. */
function scaled(places: ReadonlyMap<string, readonly number[]>, unit: number): Map<string, Place> {
  const out = new Map<string, Place>();
  for (const [k, p] of places) out.set(k, { x: (p[0] ?? 0) * unit, y: (p[1] ?? 0) * unit });
  return out;
}

/** The things each thing links to, either way, in the order written. */
function neighbours(shape: GraphShape): Map<string, string[]> {
  const near = new Map<string, string[]>(shape.things.map((t) => [t.key, []]));
  for (const l of shape.links) {
    if (l.from === l.to || !near.has(l.from) || !near.has(l.to)) continue;
    near.get(l.from)?.push(l.to);
    near.get(l.to)?.push(l.from);
  }
  return near;
}

/**
 * Radial: each part of the graph round its busiest thing, each ring one link further out. A thing's children share
 * its slice of the ring by how many leaves each holds, so branches stay apart. Parts sit side by side.
 */
function radial(shape: GraphShape): Map<string, Place> {
  const near = neighbours(shape);
  const out = new Map<string, Place>();
  const left = new Set(near.keys());
  let x0 = 0;
  while (left.size) {
    const rest = { ...shape, things: shape.things.filter((t) => left.has(t.key)) };
    const middle = busiest(rest) as string;
    // a tree of shortest paths from the middle, children in the order written
    const children = new Map<string, string[]>(),
      ring = new Map<string, number>([[middle, 0]]);
    const queue = [middle];
    for (let i = 0; i < queue.length; i++) {
      const k = queue[i] as string;
      const kids: string[] = [];
      for (const n of near.get(k) ?? [])
        if (!ring.has(n)) {
          ring.set(n, (ring.get(k) ?? 0) + 1);
          kids.push(n);
          queue.push(n);
        }
      children.set(k, kids);
    }
    const leaves = new Map<string, number>();
    for (const k of [...queue].reverse())
      leaves.set(
        k,
        Math.max(
          1,
          (children.get(k) ?? []).reduce((s, c) => s + (leaves.get(c) ?? 0), 0),
        ),
      );
    // the outer ring wide enough for every leaf to have room
    const deepest = Math.max(...ring.values());
    const total = leaves.get(middle) ?? 1;
    const gap = Math.max(RING_GAP, deepest ? (total * RING_ROOM) / (2 * Math.PI * deepest) : 0);
    const radius = deepest * gap;
    const at = new Map<string, Place>();
    const lay = (k: string, from: number, to: number): void => {
      const d = (ring.get(k) ?? 0) * gap,
        mid = (from + to) / 2 - Math.PI / 2;
      at.set(k, { x: d * Math.cos(mid), y: d * Math.sin(mid) });
      let a = from;
      for (const c of children.get(k) ?? []) {
        const share = ((to - from) * (leaves.get(c) ?? 1)) / (leaves.get(k) ?? 1);
        lay(c, a, a + share);
        a += share;
      }
    };
    lay(middle, 0, 2 * Math.PI);
    for (const [k, p] of at) {
      out.set(k, { x: x0 + radius + p.x, y: radius + p.y });
      left.delete(k);
    }
    x0 += 2 * radius + PART_GAP;
  }
  return out;
}

/**
 * `shape` drawn as `type`: a scene of one level holding every thing, each at its place, in its subject's colour from
 * `full`, the network's scene. `own` is the colour a person picked for a subject, if any.
 */
export function laidOf(type: LaidType, shape: GraphShape, full: Scene, own?: OwnColour, plan?: DiagramPlan): Ego {
  const tiled = TILED.has(type) ? viewMarks(type as Drawn, shape) : undefined;
  const line = type === 'timeline' ? timelineLaid(shape, plan) : type === 'lanes' ? lanesLaid(shape) : undefined;
  const places = tiled ? drawn(type as Drawn, shape, tiled) : (line?.places ?? placesOf(type, shape));
  const backdrop = tiled ?? line?.marks;
  const nodes = new Map<string, SceneNode>(
    shape.things.map((t) => [t.key, { key: t.key, name: t.text, depth: 0, children: [], items: [t.key] }]),
  );
  const keys = shape.things.map((t) => t.key);
  const scene: Scene = {
    depths: full.depths.slice(-1),
    nodes,
    roots: [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    named: keys,
    // a tiled type draws its own links and colours, in its backdrop
    roads: [tiled ? [] : roadsAmong(shape, new Map(keys.map((k) => [k, 0])))],
    ...(backdrop
      ? { backdrop: { marks: backdrop, names: new Set(shape.things.flatMap((t) => [t.text, t.key])) } }
      : {}),
    ...(tiled ? {} : { areas: areasIn(full, keys, reachOf(places)) }),
  };
  const spots = new Map<string, Spot>();
  for (const [k, p] of places) spots.set(k, { ...p, r: ITEM_GAP / 2 });
  return { scene, spots, own: subjectColour(full, own) };
}

/** The things of `keys` by the subject `full` puts each in, subjects in the note's order. */
function areasIn(full: Scene, keys: readonly string[], reach: number): SceneArea[] {
  if (full.depths.length < 2) return [];
  const top = (key: string): string => {
    let at = full.nodes.get(key);
    while (at?.parent !== undefined) at = full.nodes.get(at.parent);
    return at?.key ?? key;
  };
  const by = new Map<string, string[]>(full.named.map((k) => [k, []]));
  for (const k of keys) by.get(top(k))?.push(k);
  return [...by].filter(([, items]) => items.length).map(([key, items]) => ({ key, items, reach }));
}

/** How far a subject's patch reaches round each thing: most of the way to its nearest neighbour, as things usually sit. */
function reachOf(places: ReadonlyMap<string, Place>): number {
  const list = [...places.values()];
  const nearest = list.map((p) =>
    Math.min(...list.filter((q) => q !== p).map((q) => Math.hypot(p.x - q.x, p.y - q.y))),
  );
  const sorted = nearest.filter(Number.isFinite).sort((a, b) => a - b);
  return Math.max(ITEM_GAP * 2, 0.8 * (sorted[Math.floor(sorted.length / 2)] ?? 0));
}
