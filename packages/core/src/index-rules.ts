// The names the core's entry exports for rules and looks (editor spec §56) and intents (§58). Kept apart from index.ts so each file stays
// short.
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
export { ruleMovedUp, ruleRemoved } from './rule-remove.ts';
export type { RuleRemove } from './rule-remove.ts';
export type { RuleAsk, RuleWrite } from './rule-write.ts';
export { INTENT_LINK_TYPES, UNSTATED, intentLinks, intentStanding, intentStandings, intentThings } from './intents.ts';
export type { IntentLink, IntentSide, IntentStanding } from './intents.ts';
export { INTENT_MARKS, intentOverlay, intentPulls, withIntentOverlay } from './intent-overlay.ts';
export type { IntentAsk, IntentOverlay, IntentPull } from './intent-overlay.ts';
