// A filter asked for in words (editor spec §25, untangle_ask_filter). Roger, 13 Nov 2026: "I would love an AI-enabled
// filter". A person writes what they want to see, such as "open risks owned by Sam". An AI turns the words into the
// plain filter a person builds by hand. It is a kind, and up to four tests on properties.
// - The words go the one way anything is sent (rule-describe.ts): the request shown first, one send per yes, recorded.
// - The answer is read as untrusted, as a rule's is. Only its kind and tests are kept, and the test is written by the
//   builder (whenOf), never taken as text. An answer about links fills nothing: this filter is for things.
// - It only fills the filter. The person sees what it keeps, counted, and shows it themselves. Nothing is written to
//   the note (untangle_data_untouched): it changes the picture, and the rest fades, or hides if the person asks.
//
// Host-free and pure.
import type { Graph } from '@thoughtknot/graph-spec';
import type { FocusEdge, Kept } from './focus.ts';
import type { GraphDrawing } from './note-reading.ts';
import { sayDraft, testsOf, whenOf } from './rule-builder.ts';
import type { RuleChoices, RuleDraft } from './rule-builder.ts';
import { ruleThings } from './rule-looks.ts';
import type { RuleWrite } from './rule-write.ts';
import { word } from './words.ts';

/** A filter shown on the drawing: the things it keeps, and whether the rest is hidden rather than faded. */
export interface AskedFilter {
  things: ReadonlySet<string>;
  hide: boolean;
}

/** A blank filter on things of any kind, with one test to fill in. */
export function blankFilter(): RuleDraft {
  return { on: 'things', of: '', tests: [{ field: '', op: 'is', value: '' }] };
}

/** The filter a rule an AI described comes to: its kind and its tests; null for a rule on links or with no tests. */
export function filterOfRule(rule: RuleWrite): RuleDraft | null {
  if (rule.type !== undefined || rule.lens !== undefined || !rule.when) return null;
  const tests = testsOf(rule.when);
  return tests?.length ? { on: 'things', of: rule.kind ?? '', tests } : null;
}

/** Whether a filter holds anything to filter by: a kind, or a test filled in. */
export function filterReady(draft: RuleDraft): boolean {
  return draft.on === 'things' && (draft.of !== '' || whenOf(draft) !== '');
}

/** The keys of the things of `graph` the filter keeps, run as every rule is (rule-looks.ts), so no second engine. */
export function filterKeeps(graph: Graph, draft: RuleDraft, choices?: RuleChoices): string[] {
  if (!filterReady(draft)) return [];
  const when = whenOf(draft, choices);
  if (!when) return [...graph.nodes.keys()].filter((k) => graph.has(k, draft.of));
  return ruleThings(graph, { at: { block: -1, line: 0, id: 'filter' }, means: '', when, kind: draft.of || undefined });
}

/** The filter in plain words, such as "Risk where owner is Sam", or "things where status is late". */
export function filterSaid(draft: RuleDraft): string {
  const tests = sayDraft(draft);
  const of = draft.of || word('filter.ask.things');
  return tests ? word('filter.ask.said', { of, tests }) : of;
}

/**
 * What a drawing shows with the filter `asked` over the legend's choice. The things it keeps, and the links among them,
 * come forward and the rest fades. When the rest is hidden, every other thing and link is hidden too. What the legend
 * hides stays hidden. With no filter, the legend's choice is as it is.
 */
export function withAsked(
  d: Pick<GraphDrawing, 'boxes'>,
  edges: readonly FocusEdge[],
  legend: { forward: Kept | null; hidden: Kept },
  asked: AskedFilter | null,
): { forward: Kept | null; hidden: Kept } {
  if (!asked) return legend;
  const forward: Kept = {
    things: new Set(d.boxes.map((b) => b.key).filter((k) => asked.things.has(k))),
    edges: new Set(),
  };
  const hidden: Kept = { things: new Set(legend.hidden.things), edges: new Set(legend.hidden.edges) };
  edges.forEach((e, i) => {
    if (forward.things.has(e.from) && forward.things.has(e.to)) forward.edges.add(i);
    else if (asked.hide) hidden.edges.add(i);
  });
  if (asked.hide) for (const b of d.boxes) if (!forward.things.has(b.key)) hidden.things.add(b.key);
  for (const k of hidden.things) forward.things.delete(k);
  for (const i of hidden.edges) forward.edges.delete(i);
  return { forward, hidden };
}
