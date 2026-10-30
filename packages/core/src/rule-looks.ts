// Rules and looks (editor spec §56). A look in the style graph may carry a `when`, a short test of each thing's or
// link's properties, or name a lens. Every thing or link its rule finds takes its look. Both run as lenses
// (graph-spec `queryThings`, `queryLinks`, `runLens`), so the JavaScript and Python engines find the same things.
// - A rule's look is never colour alone: it adds a badge or a line (rule_look_not_colour_alone).
// - It reaches the drawing as a style token, `look.<id>`, never as a colour value.
// - Looks apply in the order written. Two that set the same part of one thing clash: the first wins, and the clash is a
//   problem naming both (rule_look_order).
// - The legend is made from each rule's meaning, so it follows the style graph with no upkeep (rule_look_legend).
// Host-free and pure: it reads the style graph and the graph, and gives what each thing and link is drawn with.
import gs from '@thoughtknot/graph-spec';
import type { Graph } from '@thoughtknot/graph-spec';
import type { Problem } from './note-reading.ts';
import { isRule } from './rule-words.ts';
import type { Badge } from './rule-words.ts';
import { styleProblem } from './style-graph.ts';
import type { LineStyle, Look, StyleGraph, StyleScope, TextFormat } from './style-graph.ts';
import { word } from './words.ts';

/** How each badge is drawn: a glyph beside a thing's name, or over a link's words. */
export const BADGE_GLYPHS: Readonly<Record<Badge, string>> = {
  clock: '⏱',
  flag: '⚑',
  star: '★',
  warning: '⚠',
  check: '✓',
  cross: '✗',
  question: '?',
  dot: '●',
  up: '▲',
  down: '▼',
};

/** The parts of a mark a rule's look may set. Two rules that set one part of one thing clash (rule_look_order). */
export const LOOK_PARTS = ['colour', 'line', 'format', 'badge'] as const;
/** One part a rule's look may set. */
export type LookPart = (typeof LOOK_PARTS)[number];

/** What the rules give one thing or link: each part from the first rule that sets it, and their tokens and meanings. */
export interface RuleMark {
  /** The style token of each rule that gave it a part, in the order written, such as `look.late`. */
  tokens: string[];
  /** A named hue of the locked style, drawn through its blends, never a raw colour. */
  hue?: string;
  line?: LineStyle;
  format?: TextFormat;
  badge?: Badge;
  /** What each of those rules means, in the order written, so a screen reader says it. */
  means: string[];
}

/** What the rules of a scope give: each thing by key, each link by its place in the graph's edges, and the clashes. */
export interface RuleLooks {
  things: Map<string, RuleMark>;
  links: Map<number, RuleMark>;
  /** Each pair of rules that set the same part of one thing or link: a warning on the later one's line. */
  clashes: Problem[];
}

/** One row of the rules' legend: a rule's token, what it shows, and what it means. */
export interface RuleLegendEntry {
  token: string;
  hue?: string;
  line?: LineStyle;
  format?: TextFormat;
  badge?: Badge;
  means: string;
}

/** A rule's style token: `look.` and its id in the style graph, in the letters a token may hold. */
export const lookToken = (l: Look): string =>
  `look.${l.at.id
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')}`;

/**
 * The rules' looks that hold in `scope`, in the order written: those for every drawing of the graph, and those for
 * its view or path. With no scope, only those for every drawing.
 */
export function rulesIn(style: Pick<StyleGraph, 'looks'>, scope: StyleScope = {}): Look[] {
  return style.looks.filter(
    (l) =>
      isRule(l) &&
      ((l.view === undefined && l.path === undefined) ||
        (scope.view !== undefined && l.view === scope.view) ||
        (scope.path !== undefined && l.path === scope.path)),
  );
}

/** The things a rule finds, run as a lens: its lens, or its `when` as a query of its kind or of every thing. */
export function ruleThings(graph: Graph, rule: Look): string[] {
  if (rule.type !== undefined) return [];
  if (rule.lens !== undefined) {
    const lens = gs.lensesOf(graph).find((l) => l.id === rule.lens);
    if (!lens) return [];
    const things = gs.runLens(graph, lens.id).things;
    return rule.kind === undefined ? things : things.filter((t) => graph.has(t, rule.kind ?? ''));
  }
  return gs.queryThings(graph, `${rule.kind ?? '*'} WHERE ${rule.when ?? ''}`);
}

/** The links a rule finds, by their place in the graph's edges: those of its type whose properties pass its `when`. */
export function ruleLinks(graph: Graph, rule: Look): number[] {
  return rule.type !== undefined && rule.when !== undefined ? gs.queryLinks(graph, rule.type, rule.when) : [];
}

/**
 * What the rules of `scope` give each thing and link of `graph`, the graph `name`. Each part comes from the first rule
 * written that sets it. A later rule that sets it again for the same thing or link is a clash. It is said once for
 * each pair of rules, naming both and the first thing it was found on.
 */
export function ruleLooks(
  style: Pick<StyleGraph, 'looks'>,
  graph: Graph,
  name: string,
  scope: StyleScope = {},
): RuleLooks {
  const out: RuleLooks = { things: new Map(), links: new Map(), clashes: [] };
  const said = new Set<string>(),
    // which rule gave each part of a mark, to name it in a clash
    setBy = new WeakMap<RuleMark, Partial<Record<LookPart, string>>>();
  const give = <K>(marks: Map<K, RuleMark>, key: K, rule: Look, shownAs: string) => {
    const mark = marks.get(key) ?? { tokens: [], means: [] },
      by = setBy.get(mark) ?? {};
    let gave = false;
    for (const part of LOOK_PARTS) {
      const value = part === 'colour' ? rule.colour : rule[part];
      if (value === undefined) continue;
      const first = by[part];
      if (first === undefined) {
        Object.assign(mark, { [part === 'colour' ? 'hue' : part]: value });
        by[part] = rule.at.id;
        gave = true;
        continue;
      }
      const pair = `${first}\u0000${rule.at.id}\u0000${part}`;
      if (said.has(pair)) continue;
      said.add(pair);
      const named = word(`styling.part.${part}`);
      out.clashes.push({
        ...styleProblem(
          name,
          rule.at,
          'GN808',
          word('styling.rule.clash', { first, second: rule.at.id, part: named, thing: shownAs }),
          word('styling.rule.clash.fix', { part: named }),
        ),
        severity: 'warning',
      });
    }
    if (!gave) return;
    mark.tokens.push(lookToken(rule));
    mark.means.push(rule.means ?? '');
    setBy.set(mark, by);
    marks.set(key, mark);
  };
  for (const rule of rulesIn(style, scope)) {
    for (const key of ruleThings(graph, rule)) give(out.things, key, rule, key);
    for (const n of ruleLinks(graph, rule)) {
      const [from, type, to] = graph.edges[n] ?? [];
      give(out.links, n, rule, `${from} ${type} ${to}`);
    }
  }
  return out;
}

/**
 * The rules' legend for `scope` (rule_look_legend): each rule's look beside its meaning, in the order written, made
 * from the style graph alone. Adding, changing or taking out a rule changes it with no other edit.
 */
export function ruleLegend(style: Pick<StyleGraph, 'looks'>, scope: StyleScope = {}): RuleLegendEntry[] {
  return rulesIn(style, scope).map((l) => ({
    token: lookToken(l),
    ...(l.colour !== undefined ? { hue: l.colour } : {}),
    ...(l.line !== undefined ? { line: l.line } : {}),
    ...(l.format !== undefined ? { format: l.format } : {}),
    ...(l.badge !== undefined ? { badge: l.badge } : {}),
    means: l.means ?? '',
  }));
}
