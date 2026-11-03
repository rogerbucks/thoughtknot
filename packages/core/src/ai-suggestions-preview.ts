// A preview of the looks AI suggestions would give (editor spec §59, ai_suggest_preview). A suggestion waits in the
// review as a change set: the review lays it over the graph, writing nothing. Here the rules' looks are worked out on
// that laid graph. A look that only a suggestion gives is drawn dashed, marked suggested in words and in the legend.
// Nothing is saved: the preview is data for one drawing, and the note is as it was. A look still comes only from a
// value in the graph, never from a model as it draws (ai_never_draws).
import type { Graph } from '@thoughtknot/graph-spec';
import type { GraphDrawing } from './note-reading.ts';
import type { Marks } from './proposals-marks.ts';
import { ruleLooks, rulesFor } from './rule-looks.ts';
import type { RuleMark, RulesShown } from './rule-looks.ts';
import type { StyleGraph, StyleScope } from './style-graph.ts';
import { word } from './words.ts';

/** The token a suggested look is drawn with, beside its rules' own. */
export const SUGGESTED_TOKEN = 'ai.suggested';

/** The mark as a suggestion would give it: dashed, said to be suggested first, its rule's own parts kept. */
const suggestedMark = (m: RuleMark): RuleMark => ({
  ...m,
  line: 'dashed',
  suggested: true,
  tokens: [...m.tokens, SUGGESTED_TOKEN],
  means: [word('ai.suggest.preview-mark'), ...m.means],
});

/**
 * The rules' looks of `laid`, the graph with the waiting suggestions laid over it, as `drawing` shows it. A thing whose
 * look a suggestion changes, or a link a suggestion adds that a rule gives a look, is marked suggested. `base` is the
 * graph as the note holds it, `marks` what the waiting suggestions mark (the review's `show`).
 */
export function suggestedPreview(
  style: Pick<StyleGraph, 'looks'>,
  base: Graph | undefined,
  laid: Graph,
  drawing: Pick<GraphDrawing, 'graph' | 'boxes' | 'links'>,
  marks: Marks,
  scope: StyleScope = {},
): RulesShown {
  const shown = rulesFor(style, laid, drawing, scope);
  const before = base ? ruleLooks(style, base, drawing.graph, scope).things : new Map<string, RuleMark>();
  const same = (a: RuleMark | undefined, b: RuleMark) => a?.tokens.join(' ') === b.tokens.join(' ');
  const things = new Map(shown.things);
  let any = false;
  for (const [key, mark] of shown.things)
    if (marks.boxes.has(key) && !same(before.get(key), mark)) {
      things.set(key, suggestedMark(mark));
      any = true;
    }
  const links = new Map(shown.links);
  for (const [at, mark] of shown.links)
    if (marks.links.get(at)?.kind === 'add') {
      links.set(at, suggestedMark(mark));
      any = true;
    }
  if (!any) return shown;
  const legend = [
    ...shown.legend,
    { token: SUGGESTED_TOKEN, line: 'dashed' as const, means: word('ai.suggest.preview-legend') },
  ];
  return { ...shown, things, links, legend };
}
