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
import type { GraphDrawing, Problem } from './note-reading.ts';
import { bandHues, isRule } from './rule-words.ts';
import { lookTag } from './look-tags.ts';
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
  /** A bands rule's numbered tag for the step it falls in, such as ②, in place of a badge. */
  tag?: string;
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
  tag?: string;
  means: string;
}

/** A rule's style token: `look.` and its id in the style graph, in the letters a token may hold. It is cut by plain
 * search, not a pattern that runs slow on a long run of odd letters (js/polynomial-redos). */
export const lookToken = (l: Look): string =>
  `look.${l.at.id
    .toLowerCase()
    .split(/[^a-z0-9]/)
    .filter(Boolean)
    .join('-')}`;

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

/** A rule as it gives its look: a bands rule gives one of these for each step, with its own token and tag. */
type Step = Look & { token?: string; tag?: string };

/**
 * The steps of a bands rule (rule_look_bands), each a rule of its own. Each has a test of the number and a colour of
 * the palette, in order. It has a numbered tag, a token `look.<id>.<n>`, and its name for the legend. Other rules
 * have none.
 */
export function bandSteps(rule: Look): (Step & { when: string })[] {
  const { bands, steps } = rule;
  if (bands === undefined || !steps?.length) return [];
  const hues = bandHues(steps.length + 1),
    means = rule.means ?? bands;
  return hues.map((colour, i) => {
    const from = steps[i - 1],
      to = steps[i];
    const when =
      from === undefined
        ? `${bands} < ${to}`
        : to === undefined
          ? `${bands} >= ${from}`
          : `${bands} >= ${from} and ${bands} < ${to}`;
    const said =
      from === undefined
        ? word('styling.bands.below', { means, to: String(to) })
        : to === undefined
          ? word('styling.bands.above', { means, from: String(from) })
          : word('styling.bands.between', { means, from: String(from), to: String(to) });
    return { ...rule, colour, when, tag: lookTag(i), token: `${lookToken(rule)}.${i + 1}`, means: said };
  });
}

/** The things a rule finds, run as a lens: its lens, or its `when` as a query of its kind or of every thing. */
export function ruleThings(graph: Graph, rule: Look): string[] {
  if (rule.type !== undefined || rule.bands !== undefined) return [];
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
  const give = <K>(marks: Map<K, RuleMark>, key: K, rule: Step, shownAs: string) => {
    const mark = marks.get(key) ?? { tokens: [], means: [] },
      by = setBy.get(mark) ?? {};
    let gave = false;
    for (const part of LOOK_PARTS) {
      const value = part === 'colour' ? rule.colour : part === 'badge' ? (rule.badge ?? rule.tag) : rule[part];
      if (value === undefined) continue;
      const first = by[part];
      if (first === undefined) {
        const own = part === 'colour' ? 'hue' : part === 'badge' && rule.badge === undefined ? 'tag' : part;
        Object.assign(mark, { [own]: value });
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
    mark.tokens.push(rule.token ?? lookToken(rule));
    mark.means.push(rule.means ?? '');
    setBy.set(mark, by);
    marks.set(key, mark);
  };
  for (const rule of rulesIn(style, scope)) {
    for (const step of bandSteps(rule))
      for (const key of gs.queryThings(graph, `${rule.kind ?? '*'} WHERE ${step.when}`))
        give(out.things, key, step, key);
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
  return rulesIn(style, scope).flatMap((rule) =>
    (rule.bands === undefined ? [rule as Step] : bandSteps(rule)).map((l) => ({
      token: l.token ?? lookToken(l),
      ...(l.tag !== undefined ? { tag: l.tag } : {}),
      ...(l.colour !== undefined ? { hue: l.colour } : {}),
      ...(l.line !== undefined ? { line: l.line } : {}),
      ...(l.format !== undefined ? { format: l.format } : {}),
      ...(l.badge !== undefined ? { badge: l.badge } : {}),
      means: l.means ?? '',
    })),
  );
}

/** What a card draws with the rules of its scope: each drawn thing's and link's look, the legend, and the clashes. */
export interface RulesShown {
  things: Map<string, RuleMark>;
  /** Each drawn link's look, by its place in the drawing's links, as the card numbers them (`data-link`). */
  links: Map<number, RuleMark>;
  /** The rules that gave a look to something drawn, in the order written. */
  legend: RuleLegendEntry[];
  clashes: Problem[];
}

/**
 * The rules of `scope` as `drawing` shows them. A link drawn is matched to the link written by its two ends and type,
 * the n-th drawn to the n-th written. Only the rules that gave something drawn a look are in its legend.
 */
export function rulesFor(
  style: Pick<StyleGraph, 'looks'>,
  graph: Graph,
  drawing: Pick<GraphDrawing, 'graph' | 'boxes' | 'links'>,
  scope: StyleScope = {},
): RulesShown {
  const looks = ruleLooks(style, graph, drawing.graph, scope);
  const drawn = new Set(drawing.boxes.map((b) => b.key));
  const things = new Map([...looks.things].filter(([key]) => drawn.has(key)));
  const written = new Map<string, number[]>();
  graph.edges.forEach(([from, type, to], n) => {
    const key = `${from}\u0000${type}\u0000${to}`;
    written.set(key, [...(written.get(key) ?? []), n]);
  });
  const links = new Map<number, RuleMark>();
  drawing.links.forEach((l, i) => {
    const n = written.get(`${l.from}\u0000${l.type}\u0000${l.to}`)?.shift();
    const mark = n === undefined ? undefined : looks.links.get(n);
    if (mark) links.set(i, mark);
  });
  const used = new Set([...things.values(), ...links.values()].flatMap((m) => m.tokens));
  return { things, links, legend: ruleLegend(style, scope).filter((e) => used.has(e.token)), clashes: looks.clashes };
}
