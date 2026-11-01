// A rule built in plain words, never typed as a test (editor spec §56, rule_look_builder). Roger, 1 Nov 2026: the
// rule window must be far more friendly. So a person picks what to look at, a property, a comparison and a value, from
// lists the graph itself fills. The test is written from those picks. A rule's name says the same in words.
// Starting points are offered from the graph's own data. What a rule finds is counted as it is built, so a person
// sees it work before trying it.
//
// Host-free and pure. The test written is the rule's `when`, run as every rule is (rule-looks.ts), so it never needs
// a second engine.
import type { Graph } from '@thoughtknot/graph-spec';
import { ruleLinks, ruleThings } from './rule-looks.ts';
import type { Badge } from './rule-words.ts';
import type { RuleWrite } from './rule-write.ts';
import type { Look } from './style-graph.ts';
import { word } from './words.ts';

/** The comparisons a person picks from, in the order offered. */
export const RULE_OPS = ['is', 'not', 'more', 'less', 'least', 'most'] as const;
/** One comparison. */
export type RuleOp = (typeof RULE_OPS)[number];
/** Each comparison as the test writes it. */
const OP_SIGNS: Readonly<Record<RuleOp, string>> = {
  is: '==',
  not: '!=',
  more: '>',
  less: '<',
  least: '>=',
  most: '<=',
};
/** The comparisons only a number can take. */
export const NUMBER_OPS: readonly RuleOp[] = ['more', 'less', 'least', 'most'];

/** A property a rule may test, with the values the graph holds for it. */
export interface RuleField {
  name: string;
  /** Whether every value it holds is a number, so it may be compared by size. */
  number: boolean;
  /** Its values in the graph, most common first, at most `MOST_VALUES`. */
  values: string[];
  /** Whether some value is held by more than one, so it sorts things into groups, as a status does and a name does not. */
  groups?: boolean;
}

/** What a rule may be built from: the kinds of thing, the types of link, and the properties of each. */
export interface RuleChoices {
  kinds: string[];
  types: string[];
  things: RuleField[];
  links: RuleField[];
}

/** One test of a rule: a property, a comparison and a value. */
export interface RuleTest {
  field: string;
  op: RuleOp;
  value: string;
}

/** A rule as the builder holds it: on things (of a kind, or any) or links (of a type, or any), and its tests. */
export interface RuleDraft {
  on: 'things' | 'links';
  /** The kind or link type, or '' for any. */
  of: string;
  tests: RuleTest[];
}

/** How many values of a property are offered, and how many things are named as found. */
export const MOST_VALUES = 12;
const MOST_NAMED = 5;
/** The count of a thing's links, which every rule on things may test (graph-spec `queryThings`). */
export const LINKS_FIELD = 'links';

/** The fields of `rows`, each property's values counted, most common first. */
function fieldsOf(rows: Iterable<Record<string, unknown>>, skip: ReadonlySet<string>): RuleField[] {
  const seen = new Map<string, Map<string, number>>(),
    numbers = new Map<string, boolean>();
  for (const props of rows)
    for (const [name, v] of Object.entries(props)) {
      if (skip.has(name) || (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean')) continue;
      const counts = seen.get(name) ?? new Map<string, number>();
      counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
      seen.set(name, counts);
      numbers.set(name, (numbers.get(name) ?? true) && typeof v === 'number');
    }
  return [...seen].map(([name, counts]) => {
    const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return {
      name,
      number: numbers.get(name) ?? false,
      values: ranked.slice(0, MOST_VALUES).map(([v]) => v),
      groups: (ranked[0]?.[1] ?? 0) > 1,
    };
  });
}

/** What a rule on `graph` may be built from. The Lens things and the style's own are left out. */
export function ruleChoices(graph: Graph): RuleChoices {
  const things = [...graph.nodes.values()].filter(([labels]) => !labels.has('Lens'));
  const kinds = [...new Set(things.flatMap(([labels]) => [...labels]))].sort();
  const types = [...new Set(graph.edges.map((e) => e[1]))].sort();
  const thingFields = fieldsOf(
    things.map(([, p]) => p),
    new Set(['id']),
  );
  const links = graph.edges.map((e) => (e[3] ?? {}) as Record<string, unknown>);
  return {
    kinds,
    types,
    things: [...thingFields, { name: LINKS_FIELD, number: true, values: [] }],
    links: fieldsOf(links, new Set()),
  };
}

/** A value as the test writes it: a number or true or false as it is, any other text in quotes. */
function valueOf(v: string, number: boolean): string {
  const t = v.trim();
  if (number && t !== '' && Number.isFinite(Number(t))) return String(Number(t));
  if (t === 'true' || t === 'false') return t;
  return t.includes('"') ? `'${t.replaceAll("'", '')}'` : `"${t}"`;
}

/** Whether the field named `name` among `fields` is a number. A field not known is a number when its value is. */
const isNumber = (fields: readonly RuleField[], name: string, value: string) =>
  fields.find((f) => f.name === name)?.number ?? (value.trim() !== '' && Number.isFinite(Number(value)));

/** The test `draft` writes, each of its tests joined by `and`; empty when it has none filled in. */
export function whenOf(draft: RuleDraft, choices?: RuleChoices): string {
  const fields = (draft.on === 'links' ? choices?.links : choices?.things) ?? [];
  return draft.tests
    .filter((t) => t.field.trim() && t.value.trim())
    .map((t) => `${t.field.trim()} ${OP_SIGNS[t.op]} ${valueOf(t.value, isNumber(fields, t.field, t.value))}`)
    .join(' and ');
}

/** The tests of `draft` in plain words, such as "status is late and cost is more than 50". */
export function sayDraft(draft: RuleDraft): string {
  return draft.tests
    .filter((t) => t.field.trim() && t.value.trim())
    .map((t) =>
      word(`rules.say.${t.op}`, { field: t.field === LINKS_FIELD ? word('rules.links') : t.field, value: t.value }),
    )
    .join(word('rules.say.and'));
}

const TEST = /^\s*([A-Za-z_]\w*)\s*(==|!=|>=|<=|>|<)\s*(?:"([^"]*)"|'([^']*)'|(-?\d+(?:\.\d+)?)|(true|false))\s*$/;

/** The tests of a rule's `when`, read back for the builder; null when it holds more than simple tests joined by and. */
export function testsOf(when: string): RuleTest[] | null {
  const tests: RuleTest[] = [];
  for (const part of when.split(/\s+and\s+/)) {
    const m = TEST.exec(part);
    const op = m && RULE_OPS.find((o) => OP_SIGNS[o] === m[2]);
    if (!m?.[1] || !op) return null;
    tests.push({ field: m[1], op, value: m[3] ?? m[4] ?? m[5] ?? m[6] ?? '' });
  }
  return tests.length ? tests : null;
}

/** The look a rule to try would be, to find what it finds as every rule does. */
const lookOf = (r: RuleWrite): Look => ({
  at: { block: -1, line: 0, id: 'builder' },
  means: r.means,
  ...(r.when !== undefined ? { when: r.when } : {}),
  ...(r.lens !== undefined ? { lens: r.lens } : {}),
  ...(r.kind ? { kind: r.kind } : {}),
  ...(r.type ? { type: r.type } : {}),
});

/** What `rule` finds in `graph`, as it is being built: how many, and the first few names. */
export function ruleFinds(graph: Graph, rule: RuleWrite): { count: number; names: string[] } {
  if (!rule.when && !rule.lens) return { count: 0, names: [] };
  const look = lookOf(rule);
  if (rule.type !== undefined) {
    const links = ruleLinks(graph, look);
    const names = links.slice(0, MOST_NAMED).map((n) => {
      const [from, type, to] = graph.edges[n] ?? [];
      return `${nameOf(graph, from ?? '')} ${type ?? ''} ${nameOf(graph, to ?? '')}`;
    });
    return { count: links.length, names };
  }
  const things = ruleThings(graph, look);
  return { count: things.length, names: things.slice(0, MOST_NAMED).map((t) => nameOf(graph, t)) };
}

/** A thing's name as a person reads it: its name or title, else its key. */
function nameOf(graph: Graph, key: string): string {
  const p = graph.nodes.get(key)?.[1] ?? {};
  const named = p['name'] ?? p['title'];
  return typeof named === 'string' && named ? named : key;
}

/** A starting point offered in the builder: a whole rule, with its look, ready to try. */
export interface RuleStart {
  draft: RuleDraft;
  badge: Badge;
  colour: string;
  means: string;
}

/** The colours the starting points take, in turn, all of the style's palette. */
const START_HUES = ['red', 'orange', 'green', 'blue', 'purple', 'cyan'];
const START_BADGES: Badge[] = ['flag', 'warning', 'check', 'star', 'dot', 'clock'];

/**
 * The starting points for `choices`: one for each value of the first property of few values (such as a status), then
 * things with no links, and the most linked. At most six.
 */
export function ruleStarts(choices: RuleChoices): RuleStart[] {
  const starts: RuleStart[] = [];
  const few = choices.things.find((f) => !f.number && f.groups && f.values.length >= 2 && f.values.length <= 6);
  for (const value of few?.values.slice(0, 4) ?? []) {
    const draft: RuleDraft = { on: 'things', of: '', tests: [{ field: few?.name ?? '', op: 'is', value }] };
    const n = starts.length;
    starts.push({ draft, badge: START_BADGES[n] ?? 'dot', colour: START_HUES[n] ?? 'blue', means: sayDraft(draft) });
  }
  const linked = (op: RuleOp, value: string, badge: Badge, colour: string, means: string) =>
    starts.push({ draft: { on: 'things', of: '', tests: [{ field: LINKS_FIELD, op, value }] }, badge, colour, means });
  linked('is', '0', 'question', 'orange', word('rules.start.alone'));
  linked('least', '3', 'star', 'purple', word('rules.start.linked'));
  return starts.slice(0, 6);
}
