// What a card draws with its style graph's rules (editor spec §56). Each thing and link a rule finds gets its look,
// and the rules have a legend. Two rules that set one part of a thing are a clash, listed with the card's problems.
// Beside the legend a rule can be made: tried in reading view, saved where the note is edited (tried-types.ts). An
// intent of the graph can be shown over the card too, its marks on top of the rules' looks (§58, intent_overlay).
import {
  intentOverlay,
  ruleChoices,
  ruleFinds,
  rulesFor,
  rulesIn,
  savedRules,
  withIntentOverlay,
} from '@thoughtknot/core';
import type { Graph } from '@thoughtknot/graph-spec';
import type { GraphDrawing, IntentAsk, Problem, RuleAsk, RuleWrite, RulesShown, StyleGraph } from '@thoughtknot/core';
import type { StyleScope } from '@thoughtknot/core';
import type { IntentHeld } from './tried-types';

/**
 * The graph's intents as a card's option (§58, intent_overlay). Each can be picked. The one shown marks `drawing`, on top
 * of the rules' looks. Nothing is added when the graph holds no intent, or the card cannot hold one.
 */
export function intentOn(
  held: IntentHeld | undefined,
  graph: Graph | undefined,
  drawing: GraphDrawing | undefined,
  shown: { rules?: RulesShown; ruleAsk?: RuleAsk },
): { rules?: RulesShown; ruleAsk?: RuleAsk; intent?: IntentAsk } {
  const saysOf = (id: string): string => {
    const says = graph?.p(id).says;
    return typeof says === 'string' ? says : id;
  };
  const choices = graph?.labelled('Intent').map((id) => ({ id, says: saysOf(id) })) ?? [];
  if (!held || !graph || !drawing || !choices.length) return shown;
  const chosen = choices.some((c) => c.id === held.chosen) ? held.chosen : null;
  const overlay = chosen ? intentOverlay(graph, chosen, drawing) : undefined;
  const intent: IntentAsk = { choices, chosen, choose: (id) => held.choose(id) };
  if (!overlay) return { ...shown, intent };
  return {
    ...shown,
    rules: withIntentOverlay(shown.rules, overlay),
    intent: { ...intent, said: overlay.standing.said },
  };
}

/**
 * The rules of `scope` as `drawing` shows them, as a card's option. Their clashes are added to `problems`, each as
 * `shown` lists it. A view's card lists none, as its graph's card says them. There is nothing when there is no
 * drawing, or no rule gives anything drawn a look. `looked` is the style drawn with, with the rules tried, and what
 * the card may do with a rule.
 */
export function rulesOn<P>(
  looked: { style: StyleGraph; ask?: RuleAsk; intent?: IntentHeld },
  graph: Graph | undefined,
  drawing: GraphDrawing | undefined,
  scope: StyleScope,
  problems: P[] = [],
  shown: (p: Problem) => P = (p) => p as P,
): { rules?: RulesShown; ruleAsk?: RuleAsk } {
  const { style, ask } = looked;
  // with its graph, the form is built from lists the graph fills, and counts what a rule finds (rule_look_builder)
  const built = graph
    ? {
        choices: ruleChoices(graph),
        finds: (r: RuleWrite) => ruleFinds(graph, r),
        saved: savedRules(rulesIn(style, scope, true)), // those turned off too, to turn on
      }
    : {};
  const asked = ask ? { ruleAsk: { ...ask, ...built } } : {};
  if (!graph || !drawing || !style.looks.length) return intentOn(looked.intent, graph, drawing, asked);
  const rules = rulesFor(style, graph, drawing, scope);
  problems.push(...rules.clashes.filter((p) => p.graph === drawing.graph).map(shown));
  return intentOn(looked.intent, graph, drawing, rules.things.size || rules.links.size ? { rules, ...asked } : asked);
}
