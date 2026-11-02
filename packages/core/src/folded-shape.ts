// The View menu's folds in a view drawn as marks (editor spec §68, view_options_everywhere). Roger, 2 Nov 2026: options
// must work the same in every view. Folds reached only the drawings Graphviz lays out: a hub folded, a group folded
// into one box, links merged. They change the layout source there (fold-source.ts). A view drawn as marks, such as a
// chord or a hive, reads the graph's shape instead. So the same plan is put on the shape here. Host-free and pure.
import type { GraphShape, ShapeLink, ShapeThing } from './types-shape.ts';
import type { Folding } from './untangle-fold.ts';

/** The key a folded group is drawn by, as the layout source names its box (fold-source.ts). */
export const foldedGroupKey = (i: number): string => `group: ${i + 1}`;
/** The key a folded hub's stub is drawn by. */
export const hubStubKey = (j: number): string => `hub: ${j + 1}`;

/** "1 thing", "3 links": a count with its word. */
const counted = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * `shape` as `plan` folds and merges it:
 * - each thing hidden, and each link folded, is left out;
 * - a folded group's things are one thing, named for the group and how many it holds, and their links run to it;
 * - each hub folded gains a stub, linked to it, saying how many links it stands for;
 * - merged, the links between the same two things are drawn as one, saying how many it stands for.
 * Groups not folded stay groups. With no plan, `shape` as it is.
 */
export function foldedShape(shape: GraphShape, plan: Folding | undefined): GraphShape {
  if (!plan) return shape;
  const hidden = new Set(plan.hidden),
    folded = new Set(plan.folded),
    box = new Map<string, string>();
  plan.groups.forEach(([, things, isFolded], i) => {
    for (const k of things) if (isFolded) box.set(k, foldedGroupKey(i));
  });
  const boxes: ShapeThing[] = plan.groups.flatMap(([label, things, isFolded], i) =>
    isFolded
      ? [{ key: foldedGroupKey(i), text: `${label} (${counted(things.length, 'thing')})`, kinds: ['group'] }]
      : [],
  );
  const stubs: ShapeThing[] = plan.hubs.map(([, n], j) => ({
    key: hubStubKey(j),
    text: counted(n, 'link'),
    kinds: [],
  }));
  const things = [...shape.things.filter((t) => !hidden.has(t.key) && !box.has(t.key)), ...boxes, ...stubs];
  const at = (k: string) => box.get(k) ?? k;
  const kept = shape.links.flatMap((l, n): ShapeLink[] =>
    folded.has(n) || hidden.has(l.from) || hidden.has(l.to) ? [] : [{ ...l, from: at(l.from), to: at(l.to) }],
  );
  const links = [
    ...(plan.merge ? merged(kept) : kept),
    ...plan.hubs.map(([hub], j): ShapeLink => ({ from: hub, type: '', to: hubStubKey(j) })),
  ];
  const groups = (shape.groups ?? []).filter(([label]) => !plan.groups.some(([l, , f]) => f && l === label));
  return { things, links, ...(groups.length ? { groups } : {}) };
}

/** The links between the same two things as one, its type saying how many it stands for when more than one. */
function merged(links: readonly ShapeLink[]): ShapeLink[] {
  const pairs = new Map<string, ShapeLink[]>();
  for (const l of links) {
    const pair = `${l.from}\n${l.to}`;
    pairs.set(pair, [...(pairs.get(pair) ?? []), l]);
  }
  return [...pairs.values()].map((ls) => {
    const first = ls[0] as ShapeLink;
    return ls.length > 1 ? { ...first, type: counted(ls.length, 'link') } : first;
  });
}
