// Intents: what supports or contradicts a goal (editor spec §58). An intent is an Intent thing. It says in the person's
// own words what they are trying to reach (`says`), with an optional `test` that can be worked out (§35). The standard
// schema intent@1 types it, so a note needs no schema of its own.
// - A thing supports or contradicts an intent by a SUPPORTS or CONTRADICTS link. The link carries a likelihood word
//   (graph spec §20) and a reason (intent_links).
// - A thing linked both ways to one intent is contested, like any claim that two sources disagree on (§28).
// - An IntentRule finds its own things, by a `when` test or a lens, and links each the way it is linked to the intent.
//   Those links are worked out each time and never written into the note (intent_rule_links).
// - An intent's standing is counts in words: what supports it and what contradicts it, by likelihood word, what is
//   contested and what is not linked. It is never a typed or stored score (intent_standing).
// Host-free and pure: it reads the graph and gives the links and the standing.
import gs from '@thoughtknot/graph-spec';
import type { Graph } from '@thoughtknot/graph-spec';
import { word } from './words.ts';

/** The two link types between a thing and an intent, as written in the note. */
export const INTENT_LINK_TYPES = { SUPPORTS: 'supports', CONTRADICTS: 'contradicts' } as const;
/** Which way a thing pulls on an intent. */
export type IntentSide = 'supports' | 'contradicts';

/** The likelihood word a link without one is counted under. */
export const UNSTATED = 'unstated';

/** The kinds that are part of the intent model, so never counted as things linked or not linked to an intent. */
const NOT_THINGS = ['Intent', 'IntentRule', 'Meta', 'GraphMeta', 'ElementType'];

/** One thing's pull on one intent: written in the note, or worked out by a rule. */
export interface IntentLink {
  from: string;
  intent: string;
  side: IntentSide;
  /** The link's likelihood word (graph spec §20), or `unstated`. */
  likelihood: string;
  reason: string | null;
  /** `note` when written, `rule` when an IntentRule worked it out (never written). */
  made: 'note' | 'rule';
  /** The IntentRule that made it, for a rule's link. */
  rule?: string;
  /** True when the same thing also pulls the other way on the same intent. */
  contested: boolean;
}

/** An intent's standing, worked out each time: counts by likelihood word, never a score. */
export interface IntentStanding {
  intent: string;
  says: string;
  /** How many things support it, by likelihood word, contested ones left out. */
  supports: Record<string, number>;
  /** How many things contradict it, by likelihood word, contested ones left out. */
  contradicts: Record<string, number>;
  /** The things that pull both ways, in the order written. */
  contested: string[];
  /** The things with no link to it, in the order written. */
  unlinked: string[];
  /** The IntentRules whose test could not be run, so found nothing. */
  refused: string[];
  /** The standing said in words. */
  said: string;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const sideOf = (type: string): IntentSide | null =>
  type === 'SUPPORTS' ? 'supports' : type === 'CONTRADICTS' ? 'contradicts' : null;

/** The things an intent can be weighed against: every thing that is not part of the intent model, in the order written. */
export function intentThings(graph: Graph): string[] {
  return [...graph.nodes.keys()].filter((id) => !NOT_THINGS.some((k) => graph.has(id, k)));
}

/** What an IntentRule finds: its lens's things, or those passing its `when`, of its `kind` or any. Throws when it cannot run. */
function ruleFinds(graph: Graph, rule: string): string[] {
  const p = graph.p(rule);
  const lens = text(p.lens);
  if (lens) return gs.runLens(graph, lens).things;
  const when = text(p.when);
  if (!when) return [];
  const problem = gs.guardProblem(when);
  if (problem) throw new Error(problem);
  return gs.queryThings(graph, `${text(p.kind) ?? '*'} WHERE ${when}`);
}

/**
 * Every link between a thing and an intent, or those to one intent. Those written come first, in the order written,
 * then each rule's, in the order the rules are written. A rule's link to a thing already linked the same way to the
 * same intent is left out. `refused` collects each rule that could not run.
 */
export function intentLinks(graph: Graph, intent: string | null = null, refused: string[] = []): IntentLink[] {
  const links: IntentLink[] = [];
  const isIntent = (id: string): boolean => graph.has(id, 'Intent') && (intent === null || id === intent);
  const things = new Set(intentThings(graph));
  const has = (from: string, to: string, side: IntentSide): boolean =>
    links.some((l) => l.from === from && l.intent === to && l.side === side);
  const ofEdge = (props: Record<string, unknown>): Pick<IntentLink, 'likelihood' | 'reason'> => ({
    likelihood: text(props.likelihood) ?? text(props.certainty) ?? UNSTATED,
    reason: text(props.reason),
  });
  for (const [from, type, to, props] of graph.edges) {
    const side = sideOf(type);
    if (side && isIntent(to) && things.has(from) && !has(from, to, side))
      links.push({ from, intent: to, side, ...ofEdge(props), made: 'note', contested: false });
  }
  for (const rule of graph.labelled('IntentRule')) {
    let found: string[];
    try {
      found = ruleFinds(graph, rule).filter((id) => things.has(id));
    } catch {
      refused.push(rule);
      continue;
    }
    for (const [, type, to, props] of graph.out(rule)) {
      const side = sideOf(type);
      if (!side || !isIntent(to)) continue;
      const said = { ...ofEdge(props), reason: ofEdge(props).reason ?? text(graph.p(rule).reason) };
      for (const from of found)
        if (!has(from, to, side)) links.push({ from, intent: to, side, ...said, made: 'rule', rule, contested: false });
    }
  }
  for (const l of links)
    l.contested = links.some((o) => o.from === l.from && o.intent === l.intent && o.side !== l.side);
  return links;
}

/**
 * A likelihood word as a person reads it, with its range of chances beside it (graph spec §20): `likely (55–80%)`.
 * Where it already sits in brackets (`inBrackets`), it is `likely 55–80%`. Its hyphens are spaces. A word that is not
 * a likelihood word is said as it is, with no range.
 */
export function likelihoodSaid(likelihood: string, inBrackets = false): string {
  const said = likelihood.replace(/-/g, ' ');
  const range = gs.certaintyOf({ id: '', likelihood })?.range;
  const key = inBrackets ? 'certainty.range-in-brackets' : 'certainty.range';
  return range ? word(key, { word: said, lo: range[0], hi: range[1] }) : said;
}

/** The words of one side's counts: `2 likely 55–80%, 1 unstated`, each likelihood word with its range. */
function byWord(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([w, n]) => word('intent.by-word', { count: n, likelihood: likelihoodSaid(w, true) }))
    .join(', ');
}

/** The standing of one intent, worked out from the graph each time and said in words. Nothing is written or stored. */
export function intentStanding(graph: Graph, intent: string): IntentStanding {
  const refused: string[] = [];
  const links = intentLinks(graph, intent, refused);
  const supports: Record<string, number> = {},
    contradicts: Record<string, number> = {};
  for (const l of links) {
    if (l.contested) continue;
    const side = l.side === 'supports' ? supports : contradicts;
    side[l.likelihood] = (side[l.likelihood] ?? 0) + 1;
  }
  const linked = new Set(links.map((l) => l.from));
  const things = intentThings(graph);
  const contested = things.filter((id) => links.some((l) => l.from === id && l.contested));
  const unlinked = things.filter((id) => !linked.has(id));
  const says = text(graph.p(intent).says) ?? intent;
  const total = (c: Record<string, number>): number => Object.values(c).reduce((a, b) => a + b, 0);
  const parts = [
    total(supports)
      ? word('intent.supported-by', { count: total(supports), words: byWord(supports) })
      : word('intent.supported-by-none'),
    total(contradicts)
      ? word('intent.contradicted-by', { count: total(contradicts), words: byWord(contradicts) })
      : word('intent.contradicted-by-none'),
  ];
  if (contested.length) parts.push(word('intent.contested', { count: contested.length }));
  parts.push(word('intent.unlinked', { count: unlinked.length }));
  return {
    intent,
    says,
    supports,
    contradicts,
    contested,
    unlinked,
    refused,
    said: word('intent.standing', { says, parts: parts.join('; ') }),
  };
}

/** The standing of every intent in the graph, in the order written. */
export function intentStandings(graph: Graph): IntentStanding[] {
  return graph.labelled('Intent').map((id) => intentStanding(graph, id));
}
