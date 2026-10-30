// What a card draws with its style graph's rules (editor spec §56). Each thing and link a rule finds gets its look,
// and the rules have a legend. Two rules that set one part of a thing are a clash, listed with the card's problems.
import { rulesFor } from '@thoughtknot/core';
import type { Graph } from '@thoughtknot/graph-spec';
import type { GraphDrawing, Problem, RulesShown, StyleGraph, StyleScope } from '@thoughtknot/core';

/**
 * The rules of `scope` as `drawing` shows them, as a card's option. Their clashes are added to `problems`, each as
 * `shown` lists it. A view's card lists none, as its graph's card says them. There is nothing when there is no
 * drawing, or no rule gives anything drawn a look.
 */
export function rulesOn<P>(
  style: StyleGraph,
  graph: Graph | undefined,
  drawing: GraphDrawing | undefined,
  scope: StyleScope,
  problems: P[] = [],
  shown: (p: Problem) => P = (p) => p as P,
): { rules?: RulesShown } {
  if (!graph || !drawing || !style.looks.length) return {};
  const rules = rulesFor(style, graph, drawing, scope);
  problems.push(...rules.clashes.filter((p) => p.graph === drawing.graph).map(shown));
  return rules.things.size || rules.links.size ? { rules } : {};
}
