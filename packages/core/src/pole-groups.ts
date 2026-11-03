// Poles on a graph too large to draw (editor spec §58, intent_poles_massive). Its overview shows each group as a box
// (overview.ts). Choosing intents as poles places each group by its balance: how many of its things support each pole,
// and how many contradict it. That is the pole view's own rule (pole-view.ts). So a group of things that support one
// intent sits near it. A group torn between two sits between them.
// - Nothing is laid out from scratch (scale_layout_static). Each group's new place is worked out from the counts
//   alone, and each glides there from where it was (layout-glide.ts).
// - In reading view the poles are only tried. Where the note is edited they are saved in the style graph.
// Host-free and pure.
import type { Graph } from '@thoughtknot/graph-spec';
import { intentLinks } from './intents.ts';
import { offsetsOf } from './layout-glide.ts';
import type { Offsets, Pt } from './layout-glide.ts';
import type { DrawMark } from './drawing-marks.ts';
import type { MarkPoint } from './plugin-diagrams.ts';
import type { LaidMarks } from './graphviz-marks.ts';
import type { Grouping } from './scale-groups.ts';
import { pullPlaces } from './view-types/pole-view.ts';
import type { PolePlaces, Pull } from './view-types/pole-view.ts';

/** One group's balance on each pole: how many of its things support it and how many contradict it. */
export type GroupBalance = Map<string, Pull>;

/**
 * Each group's balance on each of `poles`, by the group's id. It counts every link to a pole, written or made by a
 * rule (intents.ts). A thing that pulls both ways on a pole counts on both sides, so its group is pulled both ways too.
 */
export function groupBalances(grouping: Grouping, graph: Graph, poles: readonly string[]): Map<string, GroupBalance> {
  const groupOf = new Map<string, string>();
  for (const g of grouping.groups) for (const k of g.keys) groupOf.set(k, g.id);
  const wanted = new Set(poles);
  const out = new Map<string, GroupBalance>();
  for (const l of intentLinks(graph)) {
    const group = groupOf.get(l.from);
    if (!group || !wanted.has(l.intent)) continue;
    const of = out.get(group) ?? new Map<string, Pull>();
    const pull = of.get(l.intent) ?? { for: 0, against: 0 };
    if (l.side === 'supports') pull.for += 1;
    else pull.against += 1;
    of.set(l.intent, pull);
    out.set(group, of);
  }
  return out;
}

/** Where each group's middle goes with `poles` chosen, in a space of `width` by `height`: by its balance alone. */
export function poleGroupPlaces(
  grouping: Grouping,
  graph: Graph,
  poles: readonly string[],
  width: number,
  height: number,
): PolePlaces {
  const keys = grouping.groups.map((g) => g.id);
  return pullPlaces(poles, keys, groupBalances(grouping, graph, poles), width, height);
}

/** What choosing poles gives the overview: each group's new middle, and how far each glides there from where it was. */
export interface PoleGlide {
  places: PolePlaces;
  /** Each group's new middle, by its id; the poles themselves are not groups, so are not in it. */
  now: Map<string, Pt>;
  /** Each group's offset from its new middle at the glide's start (layout-glide.ts); one that did not move has none. */
  offsets: Offsets;
}

/**
 * The glide of the overview's groups to their places round `poles`, from `was`, each group's middle now. The places
 * come from the balance alone, so no group is laid out again.
 */
export function poleGlide(
  was: ReadonlyMap<string, Pt>,
  grouping: Grouping,
  graph: Graph,
  poles: readonly string[],
  space: { width: number; height: number },
): PoleGlide {
  const places = poleGroupPlaces(grouping, graph, poles, space.width, space.height);
  const now = new Map<string, Pt>();
  for (const g of grouping.groups) {
    const at = places.at.get(g.id);
    if (at) now.set(g.id, at);
  }
  return { places, now, offsets: offsetsOf(was, now) };
}

/** The largest share of the overview's width a group's box keeps round the poles, so the groups do not pile up. */
const GROUP_SHARE = 0.14;

/** `m` moved so the point `from` lands on `to`, and shrunk by `k` about it. A link is not moved here. */
function movedBy(m: DrawMark, from: Pt, to: Pt, k: number): DrawMark {
  const x = (v: number) => to[0] + (v - from[0]) * k,
    y = (v: number) => to[1] + (v - from[1]) * k;
  if (m.kind === 'group' || m.kind === 'box')
    return { ...m, x: x(m.x), y: y(m.y), width: m.width * k, height: m.height * k };
  if (m.kind === 'label')
    return { ...m, x: x(m.x), y: y(m.y), size: m.size * k, ...(m.maxWidth ? { maxWidth: m.maxWidth * k } : {}) };
  return m;
}

/**
 * The overview `laid` placed round `poles`. Each group's box, name and counts move to its place by its balance. Each
 * is shrunk to fit beside the others, and each link between groups runs between their new middles. Each pole is named where
 * it stands. The overview is not laid out again: its marks are only moved, so they glide (filter-live.ts, `glide`).
 */
export function poledMarks(laid: LaidMarks, grouping: Grouping, graph: Graph, poles: readonly string[]): LaidMarks {
  if (!poles.length) return laid;
  const was = new Map<string, Pt>(),
    side = new Map<string, number>();
  for (const m of laid.marks)
    if (m.kind === 'group') {
      was.set(m.id, [m.x + m.width / 2, m.y + m.height / 2]);
      side.set(m.id, Math.max(m.width, m.height, 1));
    }
  const { places, now } = poleGlide(was, grouping, graph, poles, laid.space);
  const most = laid.space.width * GROUP_SHARE;
  const marks = laid.marks.map((m) => {
    if (m.kind === 'link' && m.from && m.to) {
      const a = now.get(m.from),
        b = now.get(m.to);
      return a && b ? { ...m, points: [[a[0], a[1]] as MarkPoint, [b[0], b[1]] as MarkPoint] } : m;
    }
    const id = m.kind === 'group' ? m.id : m.group;
    const from = id ? was.get(id) : undefined,
      to = id ? now.get(id) : undefined;
    return id && from && to ? movedBy(m, from, to, Math.min(1, most / (side.get(id) ?? 1))) : m;
  });
  for (const pole of poles) {
    const at = places.at.get(pole),
      says = graph.p(pole).says;
    if (at)
      marks.push({
        id: `pole:${pole}`,
        kind: 'label',
        style: 'overview.name',
        x: at[0],
        y: at[1],
        text: typeof says === 'string' ? says : pole,
        size: most / 6,
        anchor: 'middle',
        maxWidth: most * 2,
        z: 3,
      });
  }
  return { space: laid.space, marks };
}

/** The poles chosen, as the style graph keeps them: the intents' ids, in the order chosen. */
export const polesLine = (poles: readonly string[]): string => poles.join(', ');

/** Where the poles were chosen, and what happens to them: tried and forgotten, or saved. */
export type PolesChosen = { tried: string[] } | { saved: string };

/**
 * Choosing `poles` on the card. In reading view they are only tried: nothing is saved, and the card is drawn with
 * them. Where the note is edited, `save` writes them into the style graph.
 */
export function choosePoles(
  mode: 'reading' | 'editing',
  poles: readonly string[],
  save: (line: string) => void,
): PolesChosen {
  if (mode === 'reading') return { tried: [...poles] };
  const line = polesLine(poles);
  save(line);
  return { saved: line };
}
