// The connected parts of a graph, each laid out on its own and packed to a screen's shape (editor spec §68,
// layout_parts_packed). Roger chose it, 28 Oct 2026. One layout for a whole graph drew one big flow and a few loose
// notes as one sprawling drawing. So each part is laid out by its own shape. The parts are packed in rows, the largest
// first, to about a screen's shape. Things with no link sit together in a tray, by name, packed the same way.
// The flat engine packs boxes (own-engine.ts); the space view packs the parts its force layout spread (space-parts.ts).
// Host-free and pure.
import type { GraphShape } from '../types-shape.ts';
import { SCREEN } from './folded-rows.ts';
import type { Group, GroupBox } from './grouped.ts';

/** A drawing, or one part of it, laid out: its boxes' middles, its links' bends and its groups' boxes. */
export interface Placed {
  spots: Map<string, [number, number]>;
  via: Map<string, [number, number][]>;
  boxes: GroupBox[];
}

/** A link between two things, by their keys. */
interface Joined {
  from: string;
  to: string;
}

/**
 * The connected parts of `keys`: things a link joins, either way, or that sit in one of `together`. The largest comes
 * first, then the one whose first thing comes first in `keys`. Each part keeps the order of `keys`.
 */
export function partsOf(
  keys: readonly string[],
  links: readonly Joined[],
  together: readonly (readonly string[])[] = [],
): string[][] {
  const index = new Map(keys.map((k, i) => [k, i]));
  const up = keys.map((_, i) => i);
  const root = (i: number): number => {
    let r = i;
    while (up[r] !== r) r = up[r] as number;
    // each thing on the way points straight at the root, so the next look is quick
    for (let j = i; up[j] !== r;) {
      const next = up[j] as number;
      up[j] = r;
      j = next;
    }
    return r;
  };
  // the root is always the thing that comes first, so a part's root says where it comes in `keys`
  const join = (a: number | undefined, b: number | undefined) => {
    if (a === undefined || b === undefined) return;
    const p = root(a),
      q = root(b);
    if (p !== q) up[Math.max(p, q)] = Math.min(p, q);
  };
  for (const l of links) join(index.get(l.from), index.get(l.to));
  for (const g of together) for (const k of g) join(index.get(g[0] as string), index.get(k));
  const parts = new Map<number, string[]>();
  keys.forEach((k, i) => {
    const r = root(i);
    const part = parts.get(r);
    if (part) part.push(k);
    else parts.set(r, [k]);
  });
  return [...parts.entries()].sort(([p, a], [q, b]) => b.length - a.length || p - q).map(([, part]) => part);
}

/** The most widths tried for packing: past them, evenly spread ones are tried. */
const WIDTHS_MOST = 64;

/**
 * Where each of `sizes` goes, its top left, packed in rows, `gap` apart, in the order given. A row ends where the next
 * would pass a width. Rows of one, two, three… are tried. The width that gives the whole nearest `aspect` is kept: its
 * width over its height. Where two are as near, the wider is kept.
 */
export function packed(
  sizes: readonly (readonly [number, number])[],
  gap: number,
  aspect = SCREEN,
): [number, number][] {
  const rows = (across: number) => {
    let [x, y, tall, wide] = [0, 0, 0, 0];
    const at = sizes.map(([w, h]): [number, number] => {
      if (x > 0 && x + w > across) [x, y, tall] = [0, y + tall + gap, 0];
      const here: [number, number] = [x, y];
      [x, tall, wide] = [x + w + gap, Math.max(tall, h), Math.max(wide, x + w)];
      return here;
    });
    return { at, off: Math.abs(Math.log(Math.max(wide, 1) / Math.max(y + tall, 1) / aspect)) };
  };
  const ends: number[] = [];
  let x = 0;
  for (const [w] of sizes) ends.push((x += w + gap) - gap);
  const step = Math.max(1, Math.ceil(ends.length / WIDTHS_MOST));
  let best = rows(ends[0] ?? 0);
  for (let i = step; i < ends.length; i += step) {
    const tried = rows(ends[i] as number);
    if (tried.off <= best.off) best = tried;
  }
  return best.at;
}

/**
 * The tray of `loose` things: each one's middle, from the tray's top left, and the tray's size. They go by name, then
 * by key, packed in rows `gap` apart to about `aspect`, so a list of loose notes reads like a list.
 */
export function trayOf(
  loose: readonly string[],
  sizes: ReadonlyMap<string, readonly [number, number]>,
  nameOf: (key: string) => string,
  gap: number,
  aspect = SCREEN,
): { spots: Map<string, [number, number]>; size: [number, number] } {
  const sorted = [...loose].sort((a, b) => {
    const p = nameOf(a),
      q = nameOf(b);
    return p < q ? -1 : p > q ? 1 : a < b ? -1 : a > b ? 1 : 0;
  });
  const each = sorted.map((k): readonly [number, number] => sizes.get(k) ?? [0, 0]);
  const at = packed(each, gap, aspect);
  const spots = new Map<string, [number, number]>();
  let width = 0,
    height = 0;
  sorted.forEach((k, i) => {
    const [w, h] = each[i] as readonly [number, number],
      [x, y] = at[i] as [number, number];
    spots.set(k, [x + w / 2, y + h / 2]);
    [width, height] = [Math.max(width, x + w), Math.max(height, y + h)];
  });
  return { spots, size: [width, height] };
}

/** The things of `shape` with keys in `keys`, and the links between them. */
export function partShape(shape: GraphShape, keys: readonly string[]): GraphShape {
  const here = new Set(keys);
  return {
    things: shape.things.filter((t) => here.has(t.key)),
    links: shape.links.filter((l) => here.has(l.from) && here.has(l.to)),
  };
}

/** The groups of `groups` with a thing in `keys`. */
export const groupsOver = (groups: readonly Group[], keys: readonly string[]): Group[] => {
  const here = new Set(keys);
  return groups.filter((g) => g.members.some((m) => here.has(m)));
};

/** `pieces` packed to a screen's shape, `gap` apart, the first at the top left, and made one. */
export function packPlaced(
  pieces: readonly Placed[],
  sizes: ReadonlyMap<string, readonly [number, number]>,
  gap: number,
): Placed {
  const bounds = pieces.map((p) => {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    const take = (x: number, y: number, w = 0, h = 0) =>
      ([x0, y0, x1, y1] = [
        Math.min(x0, x - w / 2),
        Math.min(y0, y - h / 2),
        Math.max(x1, x + w / 2),
        Math.max(y1, y + h / 2),
      ]);
    for (const [k, [x, y]] of p.spots) take(x, y, ...(sizes.get(k) ?? [0, 0]));
    for (const ps of p.via.values()) for (const [x, y] of ps) take(x, y);
    for (const b of p.boxes) take(b.x, b.y, b.width, b.height);
    return [x0, y0, x1, y1] as const;
  });
  const at = packed(
    bounds.map(([x0, y0, x1, y1]) => [x1 - x0, y1 - y0] as const),
    gap,
  );
  const out: Placed = { spots: new Map(), via: new Map(), boxes: [] };
  pieces.forEach((p, i) => {
    const [x0, y0] = bounds[i] as readonly [number, number, number, number],
      [ox, oy] = at[i] as [number, number];
    const by = ([x, y]: readonly [number, number]): [number, number] => [x - x0 + ox, y - y0 + oy];
    for (const [k, s] of p.spots) out.spots.set(k, by(s));
    for (const [k, ps] of p.via) out.via.set(k, ps.map(by));
    for (const b of p.boxes) {
      const [x, y] = by([b.x, b.y]);
      out.boxes.push({ ...b, x, y });
    }
  });
  return out;
}
