// How big each thing is, for "big items first, detail on zoom" (editor spec §68, size_score). Roger, 3 Nov 2026: draw
// the big items when zoomed out and add detail as you zoom in. A thing's size is a score from 0 to 1:
// - the more links it has, the bigger, as a hub matters more;
// - the larger the group it is drawn in, a little bigger, as it stands for more;
// - the picked thing and pinned ones are biggest, so they never fade away;
// - an `importance` property, a number from 0 to 1, written on the thing, overrides all of it: your say wins.
// Views draw things in this order, show the biggest first far out, and name them first. Host-free and pure.
import type { GraphShape } from './types-shape.ts';

/** The property a person writes on a thing to set its size: a number from 0 (least) to 1 (most). */
export const IMPORTANCE = 'importance';
/** How much a thing's group counts, against its links. */
export const GROUP_SHARE = 0.5;

/** What else makes a thing big: the picked thing, and those pinned. */
export interface SizeAsk {
  picked?: string;
  pinned?: ReadonlySet<string>;
}

const clamp = (n: number): number => Math.min(1, Math.max(0, n));

/** Each thing's size in `shape`, by key, from 0 to 1, as the comment above says. */
export function sizeScores(shape: GraphShape, { picked, pinned = new Set() }: SizeAsk = {}): Map<string, number> {
  const links = new Map<string, number>();
  for (const l of shape.links) {
    links.set(l.from, (links.get(l.from) ?? 0) + 1);
    if (l.to !== l.from) links.set(l.to, (links.get(l.to) ?? 0) + 1);
  }
  const group = new Map<string, number>();
  for (const [, keys] of shape.groups ?? [])
    for (const k of keys) group.set(k, Math.max(group.get(k) ?? 0, keys.length));
  const raw = new Map(
    shape.things.map((t) => [
      t.key,
      Math.sqrt(links.get(t.key) ?? 0) + GROUP_SHARE * Math.sqrt(Math.max(0, (group.get(t.key) ?? 1) - 1)),
    ]),
  );
  const most = Math.max(0, ...raw.values());
  const out = new Map<string, number>();
  for (const t of shape.things) {
    const own = t.numbers?.get(IMPORTANCE);
    if (own !== undefined && Number.isFinite(own)) out.set(t.key, clamp(own));
    else if (t.key === picked || pinned.has(t.key)) out.set(t.key, 1);
    else out.set(t.key, most > 0 ? (raw.get(t.key) ?? 0) / most : 0);
  }
  return out;
}

/** The keys of `scores`, biggest first; ties keep the order given. */
export const biggestFirst = (scores: ReadonlyMap<string, number>): string[] =>
  [...scores.keys()]
    .map((k, i) => ({ k, i, s: scores.get(k) ?? 0 }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.k);
