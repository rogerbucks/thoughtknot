// The names the core's entry exports for rules and looks (editor spec §56), intents (§58), AI suggestions (§59) and text to graph
// (§47). Kept apart from index.ts so each file stays short. Tables of data are in index-tables.ts, exported from here.
export { BADGES, BAND_HUES, isRule } from './rule-words.ts';
export type { Badge, RuleParts } from './rule-words.ts';
export {
  BADGE_GLYPHS,
  LOOK_PARTS,
  bandSteps,
  lookToken,
  ruleLegend,
  ruleLinks,
  ruleLooks,
  ruleThings,
  rulesFor,
  rulesIn,
} from './rule-looks.ts';
export type { LookPart, RuleLegendEntry, RuleLooks, RuleMark, RulesShown } from './rule-looks.ts';
export { ruleProps, ruleRefusal, savedRules, withTriedRules } from './rule-write.ts';
export {
  LINKS_FIELD,
  NUMBER_OPS,
  RULE_OPS,
  ruleChoices,
  ruleFinds,
  ruleStarts,
  sayDraft,
  testsOf,
  whenOf,
} from './rule-builder.ts';
export type { RuleChoices, RuleDraft, RuleField, RuleOp, RuleStart, RuleTest } from './rule-builder.ts';
export { ruleDescribeAsk } from './rule-describe.ts';
export { ruleMovedUp, ruleRemoved } from './rule-remove.ts';
export type { RuleRemove } from './rule-remove.ts';
export type { RuleAsk, RuleWrite } from './rule-write.ts';
export { INTENT_LINK_TYPES, UNSTATED, intentLinks, intentStanding, intentStandings, intentThings } from './intents.ts';
export type { IntentLink, IntentSide, IntentStanding } from './intents.ts';
export { INTENT_MARKS, intentOverlay, intentPulls, withIntentOverlay } from './intent-overlay.ts';
export type { IntentAsk, IntentOverlay, IntentPull } from './intent-overlay.ts';
export { CERTAINTY_WORDS, suggestAsk, suggestionGroups } from './ai-suggestions.ts';
export { SUGGESTED_TOKEN, suggestedPreview } from './ai-suggestions-preview.ts';
export type { SuggestFor, SuggestionGroup } from './ai-suggestions.ts';
export type { AnswerShape } from './ai-request.ts';
export {
  TEXT_MOST,
  knownThings,
  quoteSpan,
  textGraphIn,
  textGraphMessage,
  textGraphProposal,
  textToGraphAsk,
  textToGraphInstructions,
} from './text-to-graph.ts';
export type { KnownThing, Matched, TextGraph, TextGraphFor, TextSpan } from './text-to-graph.ts';
export { holdsGraph, noteWithTextGraphApplied, tickedOnly, withGraphHome } from './text-to-graph-note.ts';
export * from './index-tables.ts';
export * from './index-presets.ts';
// Claude presents and decides (§49)
export {
  CAPTION_MOST,
  linkSaid,
  pickedCss,
  pickOut,
  presentationBlock,
  presentationGraph,
  presentationsIn,
} from './presentation.ts';
export { keepPresentation, lensFinds, readSteps, STEPS_MOST, stepsMissing, Walk, withPicked } from './presentation.ts';
export type { KeptPresentation, Picked, PresentStep, StepLink } from './presentation.ts';
export { answerForClaude, decisionItems, LABEL_MOST, OPTIONS_LEAST, OPTIONS_MOST } from './decision-recorded.ts';
export { QUESTION_MOST, readAsk, readReason, REASON_MOST, recordDecision } from './decision-recorded.ts';
export type { DecisionAnswer, DecisionAsk, DecisionOption, DecisionToRecord, Recorded } from './decision-recorded.ts';
