// Levels that fit the graph, for "big items first, detail on zoom" (editor spec §68, detail_levels). Roger, 3 Nov
// 2026: show subjects first, then areas, then topics, then every item, as you zoom in. Two items need no levels; four
// hundred need four. So the count of levels comes from how many things there are, about BRANCH under each parent.
//
// The levels are found from the links, the finest first. Things that link closely make a topic (the Louvain method).
// Topics that link make an area, and areas a subject. Things linked to nothing gather as loose ends. Where a level has
// too many groups, its smallest join the group they link to most. Each group is named for its biggest
// thing (size-score.ts), until your AI or you name it. Nothing here moves a thing: the levels are only what is shown.
// Host-free and pure.
import { louvain } from './louvain.ts';
import { sizeScores } from './size-score.ts';
import type { GraphShape } from './types-shape.ts';
import { word } from './words.ts';

/** About how many groups sit under each group, and things under each finest group. */
export const BRANCH = 6;
/** The most levels, every item included. */
export const LEVELS_MOST = 4;
/** The name of each level, far to near, for a graph of 1 to LEVELS_MOST levels. */
const NAMES = ['levels.subjects', 'levels.areas', 'levels.topics'] as const;
/** What the last level, where every item shows, is called. */
export const everyItem = (): string => word('levels.every-item');
/** The key of the group of things that link to nothing in their level. */
export const LOOSE = 'loose';
/** What the group of loose ends is called. */
export const looseName = (): string => word('levels.loose-ends');

/** A group at one level: its key, its name, its things, and the group it is in one level out. */
export interface LevelGroup {
  key: string;
  name: string;
  things: string[];
  parent?: string;
}

/** One level: its name, and its groups, none at the last level, where every item shows. */
export interface DetailLevel {
  name: string;
  groups: LevelGroup[];
}

/** How many levels a graph of `n` things has, every item included: 1 for a handful, up to LEVELS_MOST. */
export const levelCount = (n: number): number =>
  n <= BRANCH ? 1 : Math.min(LEVELS_MOST, Math.ceil(Math.log(n) / Math.log(BRANCH)));

/** The names of `count` levels, far to near. */
export const levelNames = (count: number): string[] => [
  ...NAMES.slice(0, Math.max(0, count - 1)).map((k) => word(k)),
  everyItem(),
];

/** `of` with its biggest groups split by the Louvain method on their own links, while fewer than `most` groups remain. */
function split(of: number[], links: readonly (readonly [number, number])[], most: number): number[] {
  const whole = new Set<number>(),
    big = (1.5 * of.length) / most;
  for (;;) {
    const members = new Map<number, number[]>();
    of.forEach((g, i) => members.set(g, [...(members.get(g) ?? []), i]));
    if (members.size >= most) break;
    // the biggest group not yet found whole, if it is well over its share
    const [g, ms] = [...members].filter(([k]) => !whole.has(k)).sort((x, y) => y[1].length - x[1].length)[0] ?? [];
    if (g === undefined || !ms || ms.length <= big) break;
    const at = new Map(ms.map((m, i) => [m, i]));
    const inner = links.flatMap(([a, b]) => {
      const x = at.get(a),
        y = at.get(b);
      return x !== undefined && y !== undefined ? [[x, y] as const] : [];
    });
    const parts = louvain(ms.length, inner);
    if (new Set(parts).size < 2) {
      whole.add(g);
      continue;
    }
    const base = Math.max(...of) + 1;
    ms.forEach((m, i) => (of[m] = base + (parts[i] as number)));
  }
  return of;
}

/** The most groups level `depth` of `count` has, for `n` things. Far out there are about BRANCH subjects. Nearest, a
 * topic holds about BRANCH things, and the levels between are spaced evenly. */
function mostAt(depth: number, count: number, n: number): number {
  const finest = Math.max(1, n / BRANCH),
    top = Math.min(BRANCH, finest);
  const share = count > 2 ? (depth - 1) / (count - 2) : 0;
  return Math.max(1, Math.round(top * (finest / top) ** share));
}

/** Groups of `n` members from weighted links between them, joined until at most `most` remain. */
function grouped(n: number, links: readonly (readonly [number, number])[], most: number): number[] {
  // members linked to nothing gather in one group of loose ends
  const linked = new Set(links.flat()),
    loose = [...Array(n).keys()].filter((i) => !linked.has(i));
  const gather = (of: number[]): number[] => {
    for (const i of loose) of[i] = of[loose[0] as number] as number;
    return of;
  };
  // the Louvain method can join too much: a group far bigger than its share is split by its own links again
  const of = gather(split(louvain(n, links), links, most));
  // each group's links to the others, by weight, and its size
  const near = new Map<number, Map<number, number>>(),
    sizes = new Map<number, number>();
  for (const g of of) sizes.set(g, (sizes.get(g) ?? 0) + 1);
  const add = (a: number, b: number, w: number) => {
    const m = near.get(a) ?? new Map<number, number>();
    m.set(b, (m.get(b) ?? 0) + w);
    near.set(a, m);
  };
  for (const [a, b] of links) {
    const ga = of[a] as number,
      gb = of[b] as number;
    if (ga !== gb) {
      add(ga, gb, 1);
      add(gb, ga, 1);
    }
  }
  const into = new Map<number, number>();
  // join the smallest group to the one it links to most for its size, or else to the smallest other, until few remain
  while (sizes.size > most) {
    let small = -1;
    for (const [g, n] of sizes) if (small < 0 || n < (sizes.get(small) as number)) small = g;
    let to = -1,
      best = 0;
    // the one it links to most for its size, so no group snowballs
    for (const [g, w] of near.get(small) ?? []) {
      const pull = w / (sizes.get(g) as number);
      if (pull > best || (pull === best && g < to)) [to, best] = [g, pull];
    }
    if (to < 0) for (const [g, n] of sizes) if (g !== small && (to < 0 || n < (sizes.get(to) as number))) to = g;
    if (to < 0) break;
    into.set(small, to);
    sizes.set(to, (sizes.get(to) as number) + (sizes.get(small) as number));
    sizes.delete(small);
    for (const [g, w] of near.get(small) ?? []) {
      near.get(g)?.delete(small);
      if (g !== to) {
        add(to, g, w);
        add(g, to, w);
      }
    }
    near.get(to)?.delete(small);
    near.delete(small);
  }
  const root = (g: number): number => {
    let r = g;
    while (into.has(r)) r = into.get(r) as number;
    return r;
  };
  for (let i = 0; i < of.length; i++) of[i] = root(of[i] as number);
  // numbered from 0 in order of first member
  const renum = new Map<number, number>();
  return of.map((g) => renum.get(g) ?? (renum.set(g, renum.size), renum.size - 1));
}

/** The levels of `shape`, far to near, the last where every item shows. */
export function detailLevels(given: GraphShape): DetailLevel[] {
  // the same graph gives the same levels whichever order its things and links come in. So the layout and the clouds
  // drawn over it always agree (level_layout)
  const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const shape: GraphShape = {
    ...given,
    things: [...given.things].sort((a, b) => byKey(a.key, b.key)),
    links: [...given.links].sort((a, b) => byKey(a.from, b.from) || byKey(a.to, b.to) || byKey(a.type, b.type)),
  };
  const keys = shape.things.map((t) => t.key),
    count = levelCount(keys.length);
  let names = levelNames(count);
  if (count === 1) return [{ name: everyItem(), groups: [] }];
  const index = new Map(keys.map((k, i) => [k, i]));
  const text = new Map(shape.things.map((t) => [t.key, t.text]));
  const score = sizeScores(shape);
  const ends = new Set(shape.links.flatMap((l) => (l.from === l.to ? [] : [l.from, l.to])));
  let links: [number, number][] = [];
  for (const l of shape.links) {
    const a = index.get(l.from),
      b = index.get(l.to);
    if (a !== undefined && b !== undefined && a !== b) links.push([a, b]);
  }
  // finest first: each round groups the groups of the round before
  let members: string[][] = keys.map((k) => [k]);
  const rounds: string[][][] = [];
  for (let depth = count - 1; depth >= 1; depth--) {
    const of = grouped(members.length, links, mostAt(depth, count, keys.length));
    const next: string[][] = [];
    of.forEach((g, i) => (next[g] = [...(next[g] ?? []), ...(members[i] as string[])]));
    links = links.map(([a, b]) => [of[a] as number, of[b] as number] as [number, number]).filter(([a, b]) => a !== b);
    // a level that splits nothing the finer one does not is left out
    if (next.length < members.length) rounds.unshift(next);
    members = next;
  }
  names = levelNames(rounds.length + 1);
  const levels: DetailLevel[] = [];
  rounds.forEach((groups, depth) => {
    const parentOf = new Map<string, string>();
    if (depth > 0) for (const g of levels[depth - 1]?.groups ?? []) for (const t of g.things) parentOf.set(t, g.key);
    levels.push({
      name: names[depth] as string,
      groups: groups.map((things, i) => {
        const biggest = [...things].sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0))[0] as string;
        const loose = things.every((t) => !ends.has(t));
        const key = `${depth}:${loose ? LOOSE : i}`;
        const g: LevelGroup = { key, name: loose ? looseName() : (text.get(biggest) ?? biggest), things };
        const parent = parentOf.get(biggest);
        if (parent !== undefined) g.parent = parent;
        return g;
      }),
    });
  });
  levels.push({ name: everyItem(), groups: [] });
  return levels;
}

/** The most groups a level shows on screen at once: more, and the level a step out shows instead. Roger's mockup
 * shows about six subjects far out, and areas once a few subjects fill the screen. */
export const SHOWN_MOST = 12;
/** How many more things than groups may show at the last level, where every item shows. */
const ITEMS_TIMES = 3;

/** How many units of level `i` of `levels` have a thing in `seen`: its groups, or at the last level the things. */
function unitsSeen(levels: readonly DetailLevel[], i: number, seen: ReadonlySet<string>): number {
  if (i === levels.length - 1) return seen.size;
  return (levels[i]?.groups ?? []).filter((g) => g.things.some((t) => seen.has(t))).length;
}

/**
 * Which level to show, from 0 (farthest), with the things `seen` on screen: the nearest level that shows at most `most`
 * units there. Far out every thing is on screen and only the subjects fit; zoomed in, fewer things are, and the
 * nearer levels fit. A graph of one level is always at it.
 */
export function levelAt(levels: readonly DetailLevel[], seen: ReadonlySet<string>, most = SHOWN_MOST): number {
  for (let i = levels.length - 1; i > 0; i--)
    if (unitsSeen(levels, i, seen) <= (i === levels.length - 1 ? most * ITEMS_TIMES : most)) return i;
  return 0;
}

/** The badge that says where you are: "Level 2 of 4 · Areas". */
export const levelBadge = (levels: readonly DetailLevel[], at: number): string =>
  word('levels.badge', { at: at + 1, count: levels.length, name: levels[at]?.name ?? everyItem() });

/** Where the thing `key` sits in `levels`: the names of its groups, far to near, as "Money › Budget"; empty for none. */
export const levelPath = (levels: readonly DetailLevel[], key: string): string =>
  levels.flatMap((l) => l.groups.filter((g) => g.things.includes(key)).map((g) => g.name)).join(' › ');
