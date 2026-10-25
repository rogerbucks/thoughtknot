// Groups as boxes in our own engine's rows (editor spec §68, layout_groups_as_boxes). Roger, 25 Oct 2026: "Not just
// readable but conveying useful information".
//
// A group's things are laid out in rows on their own, inside a box with the group's name at its top. Then each group
// is one box among the things outside groups, and those are laid out in rows. So a group always stays together and
// never overlaps another, and no Graphviz cluster is needed, the slowest thing Graphviz does. A link into a group
// runs to the group's edge, then to its thing. Host-free and pure.
import type { GraphShape } from '../types-shape.ts';
import { layered, viaKey } from './layered.ts';
import type { Layered, Size } from './layered.ts';

/** A group: its id, its name, and the keys of its things. */
export interface Group {
  id: string;
  label: string;
  members: readonly string[];
}

/** A group's box as laid out: its middle, its size, and where its name goes. */
export interface GroupBox {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The room inside a group's box round its things, and the room its name takes at the top, in CSS pixels. */
const PAD = 16;
const LABEL = 22;

/** The bounds of a layout's spots, boxes and bends. */
function boundsOf(inner: Layered, sizes: ReadonlyMap<string, Size>): [number, number, number, number] {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const [k, [x, y]] of inner.spots) {
    const [w, h] = sizes.get(k) ?? [120, 40];
    [x0, y0, x1, y1] = [
      Math.min(x0, x - w / 2),
      Math.min(y0, y - h / 2),
      Math.max(x1, x + w / 2),
      Math.max(y1, y + h / 2),
    ];
  }
  for (const ps of inner.via.values())
    for (const [x, y] of ps) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  return [x0, y0, x1, y1];
}

/**
 * Each thing of `shape` placed in rows, the things of each of `groups` kept together in a box. A thing in two groups
 * stays in the first. Gives the spots, the links' bends and the groups' boxes.
 */
export function groupedLayered(
  shape: GraphShape,
  sizes: ReadonlyMap<string, Size>,
  groups: readonly Group[],
  rankdir: 'LR' | 'TB' = 'LR',
  previous?: ReadonlyMap<string, readonly number[]>,
): Layered & { boxes: GroupBox[] } {
  const known = new Set(shape.things.map((t) => t.key));
  const groupOf = new Map<string, string>();
  for (const g of groups) for (const k of g.members) if (known.has(k) && !groupOf.has(k)) groupOf.set(k, g.id);
  const used = groups.filter((g) => g.members.some((k) => groupOf.get(k) === g.id));
  if (!used.length) return { ...layered(shape, sizes, rankdir, previous), boxes: [] };
  // each group's own rows, and the box they need
  const inside = new Map<string, { inner: Layered; bounds: [number, number, number, number]; size: Size }>();
  for (const g of used) {
    const members = new Set(g.members.filter((k) => groupOf.get(k) === g.id));
    const sub: GraphShape = {
      things: shape.things.filter((t) => members.has(t.key)),
      links: shape.links.filter((l) => members.has(l.from) && members.has(l.to)),
    };
    const inner = layered(sub, sizes, rankdir, previous);
    const bounds = boundsOf(inner, sizes);
    const size: Size = [bounds[2] - bounds[0] + 2 * PAD, bounds[3] - bounds[1] + 2 * PAD + LABEL];
    inside.set(g.id, { inner, bounds, size });
  }
  // the rows of groups and lone things: a group is one box, its links its things' links
  const node = (k: string) => (groupOf.has(k) ? `group:${groupOf.get(k)}` : k);
  const outerSizes = new Map(sizes);
  for (const [id, { size }] of inside) outerSizes.set(`group:${id}`, size);
  const outer: GraphShape = {
    things: [
      ...shape.things.filter((t) => !groupOf.has(t.key)),
      ...used.map((g) => ({ key: `group:${g.id}`, text: g.label, kinds: [] })),
    ],
    links: shape.links
      .filter((l) => node(l.from) !== node(l.to))
      .map((l) => ({ from: node(l.from), type: l.type, to: node(l.to) })),
  };
  const top = layered(outer, outerSizes, rankdir);
  const out: Layered & { boxes: GroupBox[] } = { spots: new Map(), via: new Map(), boxes: [] };
  for (const t of shape.things) if (!groupOf.has(t.key)) out.spots.set(t.key, top.spots.get(t.key) as [number, number]);
  for (const g of used) {
    const { inner, bounds, size } = inside.get(g.id) as { inner: Layered; bounds: number[]; size: Size };
    const [cx, cy] = top.spots.get(`group:${g.id}`) as [number, number];
    // the group's things, moved so their bounds sit inside the box, below its name
    const dx = cx - size[0] / 2 + PAD - (bounds[0] as number),
      dy = cy - size[1] / 2 + PAD + LABEL - (bounds[1] as number);
    const moved = ([x, y]: readonly [number, number]): [number, number] => [x + dx, y + dy];
    for (const [k, p] of inner.spots) out.spots.set(k, moved(p));
    for (const [k, ps] of inner.via) out.via.set(k, ps.map(moved));
    out.boxes.push({ id: g.id, label: g.label, x: cx, y: cy, width: size[0], height: size[1] });
  }
  const boxOf = new Map(out.boxes.map((b) => [b.id, b]));
  // a link that leaves or enters a group bends where the group's links do, at its edge
  for (const l of shape.links) {
    const a = node(l.from),
      b = node(l.to);
    if (a === b) continue;
    const bends = top.via.get(viaKey(a, b)) ?? [];
    // from a thing in a group, first out to the group's edge, level with the thing; into one, the same way round
    const axis = rankdir === 'LR' ? 0 : 1;
    const edge = (k: string, toward: readonly [number, number]): [number, number][] => {
      const box = boxOf.get(groupOf.get(k) ?? '');
      const at = out.spots.get(k);
      if (!box || !at) return [];
      const middle = axis === 0 ? box.x : box.y,
        half = (axis === 0 ? box.width : box.height) / 2;
      const rim = middle + Math.sign(toward[axis] - middle) * half;
      return [axis === 0 ? [rim, at[1]] : [at[0], rim]];
    };
    // with no bends between them, each end heads for the other's box
    const first = (bends[0] ?? top.spots.get(b)) as [number, number],
      last = (bends[bends.length - 1] ?? top.spots.get(a)) as [number, number];
    if (!bends.length && !groupOf.has(l.from) && !groupOf.has(l.to)) continue;
    out.via.set(viaKey(l.from, l.to), [...edge(l.from, first), ...bends, ...edge(l.to, last).reverse()]);
  }
  return out;
}
