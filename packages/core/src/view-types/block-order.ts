// The order an arc or a matrix puts things in, so groups show as blocks (editor spec §68, projection_arc,
// projection_matrix). Things in one group sit side by side. The groups are those a nudge draws, as written or as the
// View menu's Group by sets them. With none, the engine finds them: the groups the links make (louvain.ts), else the
// kinds. Groups that link to each other sit next to each other. Within a group, linked things sit close
// (reverse Cuthill–McKee), so a matrix fills near its diagonal and an arc's links stay short.
// Host-free and pure: the same graph gives the same order every time.
import { louvain } from '../louvain.ts';
import type { GraphShape } from '../types-shape.ts';

/** A run of things side by side in the order: its label, and where it starts and ends (the end not in it). */
export interface Block {
  label: string;
  from: number;
  to: number;
}

/** The things' keys in order, and the blocks they form. */
export interface BlockOrder {
  order: string[];
  blocks: Block[];
}

/** The groups the shape's things fall in, as given, else found from its links, else its kinds; null for one. */
function groupsOf(shape: GraphShape): [string, string[]][] | null {
  const keys = shape.things.map((t) => t.key);
  const drawn = new Set(keys);
  // a thing written in two groups sits in the first, so each thing is in the order once
  const seen = new Set<string>();
  const given = (shape.groups ?? []).map(([l, ks]): [string, string[]] => [
    l,
    ks.filter((k) => drawn.has(k) && !seen.has(k) && !!seen.add(k)),
  ]);
  if (given.some(([, ks]) => ks.length)) {
    const placed = new Set(given.flatMap(([, ks]) => ks));
    const rest = keys.filter((k) => !placed.has(k));
    return [...given.filter(([, ks]) => ks.length), ...(rest.length ? [['', rest] as [string, string[]]] : [])];
  }
  const index = new Map(keys.map((k, i) => [k, i]));
  const links = shape.links.flatMap((l): [number, number][] => {
    const a = index.get(l.from),
      b = index.get(l.to);
    return a !== undefined && b !== undefined && a !== b ? [[a, b]] : [];
  });
  const found = new Map<number, string[]>();
  louvain(keys.length, links).forEach((g, i) => found.set(g, [...(found.get(g) ?? []), keys[i] as string]));
  if (found.size > 1 && found.size < keys.length) return [...found.values()].map((ks) => ['', ks]);
  const kinds = new Map<string, string[]>();
  for (const t of shape.things) kinds.set(t.kinds.join(', '), [...(kinds.get(t.kinds.join(', ')) ?? []), t.key]);
  return kinds.size > 1 ? [...kinds] : null;
}

/** `keys` in reverse Cuthill–McKee order by `near`: each run outward from its least linked thing, then reversed. */
function bandOrder(keys: readonly string[], near: ReadonlyMap<string, readonly string[]>): string[] {
  const inside = new Set(keys),
    degree = (k: string) => (near.get(k) ?? []).filter((n) => inside.has(n)).length;
  const byDegree = (a: string, b: string) => degree(a) - degree(b) || keys.indexOf(a) - keys.indexOf(b);
  const seen = new Set<string>(),
    out: string[] = [];
  for (const start of [...keys].sort(byDegree)) {
    if (seen.has(start)) continue;
    seen.add(start);
    const queue = [start];
    for (let k = queue.shift(); k !== undefined; k = queue.shift()) {
      out.push(k);
      const next = [...new Set(near.get(k))].filter((n) => inside.has(n) && !seen.has(n)).sort(byDegree);
      for (const n of next) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return out.reverse();
}

/** What a block is called: its group's label, or, for a group the engine found, its first thing's name and how many more. */
export function blockName(b: Block, order: readonly string[], text: (key: string) => string): string {
  if (b.label) return b.label;
  const first = text(order[b.from] ?? ''),
    more = b.to - b.from - 1;
  return more ? `${first} +${more}` : first;
}

/** The order of `shape`'s things for an arc or a matrix, and the blocks its groups form. */
export function blockOrder(shape: GraphShape): BlockOrder {
  const near = new Map<string, string[]>();
  for (const l of shape.links) {
    if (l.from === l.to) continue;
    near.set(l.from, [...(near.get(l.from) ?? []), l.to]);
    near.set(l.to, [...(near.get(l.to) ?? []), l.from]);
  }
  const groups = groupsOf(shape) ?? [['', shape.things.map((t) => t.key)]];
  // each next group is the one most linked to the group before it, the largest first
  const groupOf = new Map(groups.flatMap(([, ks], g) => ks.map((k): [string, number] => [k, g])));
  const between = (a: number, b: number) =>
    groups[a]?.[1].reduce((n, k) => n + (near.get(k) ?? []).filter((m) => groupOf.get(m) === b).length, 0) ?? 0;
  const left = groups.map((_, i) => i);
  const sizes = (i: number) => groups[i]?.[1].length ?? 0;
  const chain = [left.reduce((best, i) => (sizes(i) > sizes(best) ? i : best))];
  while (chain.length < groups.length) {
    const last = chain[chain.length - 1] as number;
    const next = left
      .filter((i) => !chain.includes(i))
      .reduce((best, i) => (best < 0 || between(last, i) > between(last, best) ? i : best), -1);
    chain.push(next);
  }
  const order: string[] = [],
    blocks: Block[] = [];
  for (const g of chain) {
    const [label, ks] = groups[g] as [string, string[]];
    blocks.push({ label, from: order.length, to: order.length + ks.length });
    order.push(...bandOrder(ks, near));
  }
  return { order, blocks };
}
