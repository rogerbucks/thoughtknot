// What a part of a graph looks like, read cheaply before it is laid out (editor spec §68, layout_kinds_read,
// layout_pick_said). Roger chose it, 28 Oct 2026: a layout picked by the parts and the kinds of thing. One rule for a
// whole graph is not enough. How its kinds link is read in one pass over its links. The pick is then said in plain
// words, where the View menu names the layout. Host-free and pure.
import type { GraphShape } from '../types-shape.ts';
import { word } from '../words.ts';
import { LAYOUT_STEPS } from './cheaper.ts';
import type { LayoutStep } from './cheaper.ts';
import { strategyName } from './offered.ts';

/** How the kinds of a part's things link. */
export type KindPattern = 'plain' | 'ordered' | 'two-sided' | 'clustered';

/** How a part's kinds link, and, for kinds in order, that order. */
export interface Kinds {
  pattern: KindPattern;
  order: string[];
}

/** The share of links between two kinds that must run one way for the kinds to be in order. */
const ORDERED_LEAST = 0.9;
/** The share of links that must run between kinds, for an order or two sides to tell anything. */
const ACROSS_LEAST = 0.5;
/** The share of links that must run between the two kinds of a part with two, for it to be two-sided. */
const SIDES_LEAST = 0.8;
/** How much more often a kind must link to itself than chance would, for kinds to be clustered: 0 chance, 1 always. */
const PULL_LEAST = 0.3;

/**
 * How the kinds of `shape`'s things link, by `kindOf` (a thing's first kind where it is not given). Kinds in order: most
 * links run from one kind to a later one, such as requirement, then test, then code. Two-sided: two kinds, linked
 * mostly across. Clustered: things link to their own kind far more than chance. Plain: anything else, or one kind.
 */
export function kindsOf(shape: GraphShape, kindOf?: ReadonlyMap<string, string>): Kinds {
  const kind = new Map(shape.things.map((t) => [t.key, kindOf?.get(t.key) ?? t.kinds[0] ?? '']));
  // only things with a link say how kinds link
  const linked = new Set(shape.links.flatMap((l) => (l.from === l.to ? [] : [l.from, l.to])));
  const count = new Map<string, number>();
  for (const [key, k] of kind) if (k && linked.has(key)) count.set(k, (count.get(k) ?? 0) + 1);
  const plain: Kinds = { pattern: 'plain', order: [] };
  if (count.size < 2) return plain;
  let same = 0,
    all = 0;
  const across = new Map<string, number>();
  for (const l of shape.links) {
    const a = kind.get(l.from),
      b = kind.get(l.to);
    if (!a || !b || l.from === l.to) continue;
    all++;
    if (a === b) same++;
    else across.set(`${a}\n${b}`, (across.get(`${a}\n${b}`) ?? 0) + 1);
  }
  if (!all) return plain;
  const crossing = (all - same) / all;
  // two sides, or kinds in order, go the way most links between them run
  const order = kindOrder([...count.keys()], across);
  if (count.size === 2 && crossing >= SIDES_LEAST) return { pattern: 'two-sided', order };
  if (count.size > 2 && crossing >= ACROSS_LEAST && forwardShare(order, across) >= ORDERED_LEAST)
    return { pattern: 'ordered', order };
  // how much more often things link to their own kind than if kinds were mixed at random
  const n = [...count.values()].reduce((t, c) => t + c, 0);
  const chance = [...count.values()].reduce((t, c) => t + (c / n) ** 2, 0);
  const pull = chance < 1 ? (same / all - chance) / (1 - chance) : 0;
  return pull >= PULL_LEAST ? { pattern: 'clustered', order: [] } : plain;
}

/** `kinds` in the order links between them run most: a kind that mostly links out comes before one mostly linked to. */
function kindOrder(kinds: readonly string[], across: ReadonlyMap<string, number>): string[] {
  const net = new Map(kinds.map((k) => [k, 0]));
  for (const [pair, c] of across) {
    const [a, b] = pair.split('\n') as [string, string];
    net.set(a, (net.get(a) ?? 0) + c);
    net.set(b, (net.get(b) ?? 0) - c);
  }
  return [...kinds].sort((p, q) => (net.get(q) ?? 0) - (net.get(p) ?? 0) || (p < q ? -1 : p > q ? 1 : 0));
}

/** The share of links between kinds that run forward in `order`. */
function forwardShare(order: readonly string[], across: ReadonlyMap<string, number>): number {
  const at = new Map(order.map((k, i) => [k, i]));
  let forward = 0,
    all = 0;
  for (const [pair, c] of across) {
    const [a, b] = pair.split('\n') as [string, string];
    all += c;
    if ((at.get(a) ?? 0) < (at.get(b) ?? 0)) forward += c;
  }
  return all ? forward / all : 0;
}

/** What the engine picked for a drawing, as its SVG carries it: the largest part's layout, and the drawing's parts. */
export interface PickShown {
  why: string;
  kinds: KindPattern;
  order: string[];
  parts: number;
  loose: number;
  /** Whether each kind has a lane of its own. */
  lanes?: boolean;
  /** Each thing's lane, by its key, so space can put each kind on a plane of its own. */
  bands?: Record<string, number>;
  /** The cheaper step it was laid out by, after a layout that ran out of time (layout_never_text). */
  step?: LayoutStep;
  /** The layout the person chose, where they chose one: rows, spread, or a plug-in's id (layout_plugins). */
  chosen?: string;
  /** Whether the layout chosen could not lay it out, so its shape picked one instead. */
  missed?: boolean;
}

/** The SVG attribute that carries what the engine picked (`PickShown`), as JSON, URI-encoded so it needs no escapes. */
export const PICK_ATTRIBUTE = 'data-layout-pick';

/** What the engine picked, `shown`, in words a person reads: how, why, and the parts and kinds it saw. */
export function pickSaid(shown: PickShown): string {
  // a step of rows or a grid is said in place of why: the graph's shape did not pick it (layout_never_text)
  const name = shown.chosen === undefined ? '' : strategyName(shown.chosen);
  const why = word(`view.layout.why.${shown.why}` as 'view.layout.why.chosen', { name });
  const step = shown.step && word(`view.layout.step.${shown.step}`);
  const lines = shown.step === 'own' ? [step as string, why] : [step || why];
  if (shown.missed) lines.unshift(word('view.layout.missed', { name }));
  if (shown.parts > 1) lines.push(word('view.layout.parts', { count: shown.parts }));
  if (shown.loose) lines.push(word('view.layout.loose', { count: shown.loose }));
  if (shown.kinds === 'ordered') lines.push(word('view.layout.kinds.ordered', { order: shown.order.join(' → ') }));
  else if (shown.kinds !== 'plain') lines.push(word(`view.layout.kinds.${shown.kinds}`));
  if (shown.lanes) lines.push(word('view.layout.kinds.lanes'));
  return lines.join(' ');
}

/** What the engine picked, read back from a drawing's SVG `attribute`; undefined where it says nothing readable. */
export function pickShownOf(attribute: string | null | undefined): PickShown | undefined {
  if (!attribute) return undefined;
  try {
    const p = JSON.parse(decodeURIComponent(attribute)) as Partial<PickShown>;
    return typeof p.why === 'string' && WHYS.includes(p.why)
      ? {
          why: p.why,
          kinds: KIND_PATTERNS.includes(p.kinds as KindPattern) ? (p.kinds as KindPattern) : 'plain',
          order: Array.isArray(p.order) ? p.order.map(String) : [],
          parts: Number(p.parts) || 1,
          loose: Number(p.loose) || 0,
          lanes: p.lanes === true,
          ...(typeof p.chosen === 'string' ? { chosen: p.chosen, missed: p.missed === true } : {}),
          ...(LAYOUT_STEPS.includes(p.step as LayoutStep) ? { step: p.step as LayoutStep } : {}),
          bands: Object.fromEntries(
            Object.entries(p.bands ?? {}).filter((e): e is [string, number] => Number.isInteger(e[1])),
          ),
        }
      : undefined;
  } catch {
    return undefined;
  }
}

/** Each thing's lane as a drawing's SVG `attribute` carries it, for space's planes (layout_kind_lanes). */
export const lanesShown = (attribute: string | null | undefined): Map<string, number> =>
  new Map(Object.entries(pickShownOf(attribute)?.bands ?? {}));

/** Every reason the engine gives for a layout (own-engine.ts `Pick`). */
const WHYS = ['flow', 'tree', 'network', 'dense', 'overview', 'tried', 'chosen'];
/** Every kind pattern. */
const KIND_PATTERNS: readonly KindPattern[] = ['plain', 'ordered', 'two-sided', 'clustered'];
