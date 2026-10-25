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
import { layoutOptions } from './layout-options.ts';
import type { LayoutOptions } from './layout-options.ts';

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
/** The gap kept inside a group's border on each side across the drawing, which links passing the group run along. */
const GUTTER = 12;
/** The room between two links sharing a gutter. */
const GUTTER_STEP = 4;
/** How far past its own box a link from a group's thing steps, into the room after its row, before it turns. */
const STEP_OUT = 12;

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
  options: Partial<LayoutOptions> = {},
): Layered & { boxes: GroupBox[] } {
  // a group's box holds its things as tightly as `groupPull` asks: half the room at the most, half again at none
  const pad = PAD * (1.5 - layoutOptions(options).groupPull);
  const known = new Set(shape.things.map((t) => t.key));
  const groupOf = new Map<string, string>();
  for (const g of groups) for (const k of g.members) if (known.has(k) && !groupOf.has(k)) groupOf.set(k, g.id);
  const used = groups.filter((g) => g.members.some((k) => groupOf.get(k) === g.id));
  if (!used.length) return { ...layered(shape, sizes, rankdir, previous, options), boxes: [] };
  // each group's own rows, and the box they need
  const inside = new Map<string, { inner: Layered; bounds: [number, number, number, number]; size: Size }>();
  for (const g of used) {
    const members = new Set(g.members.filter((k) => groupOf.get(k) === g.id));
    const sub: GraphShape = {
      things: shape.things.filter((t) => members.has(t.key)),
      links: shape.links.filter((l) => members.has(l.from) && members.has(l.to)),
    };
    const inner = layered(sub, sizes, rankdir, previous, options);
    const bounds = boundsOf(inner, sizes);
    const extra = rankdir === 'LR' ? [0, 2 * GUTTER] : [2 * GUTTER, 0];
    const size: Size = [
      bounds[2] - bounds[0] + 2 * pad + (extra[0] as number),
      bounds[3] - bounds[1] + 2 * pad + LABEL + (extra[1] as number),
    ];
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
  const top = layered(outer, outerSizes, rankdir, undefined, options);
  const out: Layered & { boxes: GroupBox[] } = { spots: new Map(), via: new Map(), boxes: [] };
  for (const t of shape.things) if (!groupOf.has(t.key)) out.spots.set(t.key, top.spots.get(t.key) as [number, number]);
  for (const g of used) {
    const { inner, bounds, size } = inside.get(g.id) as { inner: Layered; bounds: number[]; size: Size };
    const [cx, cy] = top.spots.get(`group:${g.id}`) as [number, number];
    // the group's things, moved so their bounds sit inside the box, below its name
    const gx = rankdir === 'LR' ? 0 : GUTTER,
      gy = rankdir === 'LR' ? GUTTER : 0;
    const dx = cx - size[0] / 2 + pad + gx - (bounds[0] as number),
      dy = cy - size[1] / 2 + pad + LABEL + gy - (bounds[1] as number);
    const moved = ([x, y]: readonly [number, number]): [number, number] => [x + dx, y + dy];
    for (const [k, p] of inner.spots) out.spots.set(k, moved(p));
    for (const [k, ps] of inner.via) out.via.set(k, ps.map(moved));
    out.boxes.push({ id: g.id, label: g.label, x: cx, y: cy, width: size[0], height: size[1] });
  }
  const boxOf = new Map(out.boxes.map((b) => [b.id, b]));
  const inGutter = new Map<string, number>();
  const membersOf = new Map<string, string[]>();
  for (const [k, id] of groupOf) membersOf.set(id, [...(membersOf.get(id) ?? []), k]);
  // the lone things, as boxes a link must not cut through
  const lone: GroupBox[] = shape.things
    .filter((t) => !groupOf.has(t.key))
    .map((t) => {
      const [x, y] = out.spots.get(t.key) as [number, number],
        [width, height] = sizes.get(t.key) ?? [0, 0];
      return { id: '', label: '', x, y, width: width + PAD, height: height + PAD };
    });
  // a link that leaves or enters a group bends where the group's links do, at its edge
  for (const l of shape.links) {
    const a = node(l.from),
      b = node(l.to);
    if (a === b) continue;
    const bends = top.via.get(viaKey(a, b)) ?? [];
    // from a thing in a group, first out to the group's edge, level with the thing; into one, the same way round.
    // Where another of the group's things is in that way, the link steps into the room after its thing's row. It runs
    // to the gutter nearer where it is going, then along the gutter to the edge
    const axis = rankdir === 'LR' ? 0 : 1,
      across = (1 - axis) as 0 | 1;
    const edge = (k: string, toward: readonly [number, number]): [number, number][] => {
      const box = boxOf.get(groupOf.get(k) ?? '');
      const at = out.spots.get(k);
      if (!box || !at) return [];
      const middle = axis === 0 ? box.x : box.y,
        half = (axis === 0 ? box.width : box.height) / 2;
      const way = Math.sign(toward[axis] - middle) || 1,
        rim = middle + way * half;
      const level = (along: number, across: number): [number, number] =>
        axis === 0 ? [along, across] : [across, along];
      const own = (sizes.get(k) ?? [0, 0])[axis];
      const lo = Math.min(at[axis] + (way * own) / 2, rim),
        hi = Math.max(at[axis] + (way * own) / 2, rim);
      const blocked = (membersOf.get(box.id) ?? []).some((m) => {
        if (m === k) return false;
        const p = out.spots.get(m) as [number, number],
          size = sizes.get(m) ?? [0, 0];
        const reach = (size[axis]) / 2,
          side = (size[across]) / 2;
        return p[axis] + reach > lo && p[axis] - reach < hi && Math.abs(p[across] - at[across]) < side + 2;
      });
      if (!blocked) return [level(rim, at[across])];
      // the gutter nearer where the link goes, each link in its own lane
      const centre = axis === 0 ? box.y : box.x,
        span = (axis === 0 ? box.height : box.width) / 2;
      const top = toward[across] < centre;
      const key = `${box.id} ${top ? 'top' : 'bottom'}`,
        n = inGutter.get(key) ?? 0;
      inGutter.set(key, n + 1);
      const inset = (pad + GUTTER) / 2 + (top && axis === 0 ? LABEL : 0);
      const gutter = (top ? centre - span + inset : centre + span - inset) + ((n % 5) - 2) * GUTTER_STEP;
      // past the deepest box of its row, so the turn is in the room between rows
      const row = (membersOf.get(box.id) ?? []).reduce((most, m) => {
        const p = out.spots.get(m) as [number, number];
        return Math.abs(p[axis] - at[axis]) < 1 ? Math.max(most, (sizes.get(m) ?? [0, 0])[axis]) : most;
      }, own);
      const step = at[axis] + way * (row / 2 + STEP_OUT);
      return [level(step, at[across]), level(step, gutter), level(rim, gutter)];
    };
    // with no bends between them, each end heads for the other's box
    const first = (bends[0] ?? top.spots.get(b)) as [number, number],
      last = (bends[bends.length - 1] ?? top.spots.get(a)) as [number, number];
    if (!bends.length && !groupOf.has(l.from) && !groupOf.has(l.to)) continue;
    // the ways out of and into the groups stay as they are; only the bends between them move to a gutter
    const out1 = edge(l.from, first),
      in1 = edge(l.to, last).reverse();
    const own = new Set([groupOf.get(l.from), groupOf.get(l.to)]);
    const others = [...out.boxes.filter((g) => !own.has(g.id)), ...lone];
    const between = throughGutters([...out1.slice(-1), ...bends, ...in1.slice(0, 1)], others, axis, inGutter, pad);
    out.via.set(viaKey(l.from, l.to), [...out1.slice(0, -1), ...between, ...in1.slice(1)]);
  }
  return out;
}

/**
 * `path` with each bend that goes round a group's box moved into the box's nearer gutter, when the link's straight
 * way runs through the box. So a link passes a group by the gap inside its border, not round its far end. `used`
 * counts the links in each gutter, so each takes its own lane.
 */
function throughGutters(
  path: [number, number][],
  boxes: readonly GroupBox[],
  axis: 0 | 1,
  used: Map<string, number>,
  pad = PAD,
): [number, number][] {
  if (path.length < 3) return path;
  const across = (1 - axis) as 0 | 1;
  const a = path[0] as [number, number],
    z = path[path.length - 1] as [number, number];
  const lane = new Map<string, number>();
  // where across a bend at `p` goes: into a gutter, back to the straight way, or where it is
  const acrossAt = (p: readonly [number, number]): number => {
    const t = z[axis] === a[axis] ? 0 : (p[axis] - a[axis]) / (z[axis] - a[axis]);
    const ideal = a[across] + (z[across] - a[across]) * Math.min(1, Math.max(0, t));
    const box = boxes.find((b) => {
      const mid = [b.x, b.y],
        half = [b.width / 2, b.height / 2];
      const inColumn = Math.abs(p[axis] - (mid[axis] as number)) <= (half[axis] as number) + 1;
      const lo = (mid[across] as number) - (half[across] as number),
        hi = (mid[across] as number) + (half[across] as number);
      return inColumn && ideal > lo && ideal < hi && (p[across] <= lo || p[across] >= hi);
    });
    if (!box?.id) {
      // the bend comes back to the straight way, or to the free room in its row nearest it
      const inRow = boxes.filter(
        (b) => Math.abs(p[axis] - (axis === 0 ? b.x : b.y)) <= (axis === 0 ? b.width : b.height) / 2 + 1,
      );
      const span = (b: GroupBox): [number, number] => {
        const mid = across === 0 ? b.x : b.y,
          half = (across === 0 ? b.width : b.height) / 2 + PAD;
        return [mid - half, mid + half];
      };
      const free = (v: number) => inRow.every((b) => !(v > span(b)[0] && v < span(b)[1]));
      const choices = [ideal, ...inRow.flatMap(span)].filter(free);
      return choices.reduce((best, v) => (Math.abs(v - ideal) < Math.abs(best - ideal) ? v : best), p[across]);
    }
    const mid = across === 0 ? box.x : box.y,
      half = (across === 0 ? box.width : box.height) / 2;
    // the gutter on the side the link came round, below the name when it is the top one
    const top = p[across] < mid;
    const key = `${box.id} ${top ? 'top' : 'bottom'}`;
    if (!lane.has(key)) {
      const k = used.get(key) ?? 0;
      used.set(key, k + 1);
      lane.set(key, ((k % 5) - 2) * GUTTER_STEP);
    }
    const inset = (pad + GUTTER) / 2 + (top && across === 1 ? LABEL : 0);
    return (top ? mid - half + inset : mid + half - inset) + (lane.get(key) as number);
  };
  const out = path.map((p): [number, number] => [p[0], p[1]]);
  for (let i = 1; i < path.length - 1; i++) {
    const p = path[i] as [number, number],
      q = path[i + 1] as [number, number];
    // the two bends of a lane through one row move together, so the lane stays straight through the row
    const pair = i + 1 < path.length - 1 && p[across] === q[across] && p[axis] !== q[axis];
    const at = acrossAt(pair ? (axis === 0 ? [(p[0] + q[0]) / 2, p[1]] : [p[0], (p[1] + q[1]) / 2]) : p);
    for (const j of pair ? [i, i + 1] : [i]) (out[j] as [number, number])[across] = at;
    if (pair) i++;
  }
  return out;
}
