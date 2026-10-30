// The names the core's entry exports for rules and looks (editor spec §56). Kept apart from index.ts so each file stays
// short.
export { BADGES, isRule } from './rule-words.ts';
export type { Badge, RuleParts } from './rule-words.ts';
export {
  BADGE_GLYPHS,
  LOOK_PARTS,
  lookToken,
  ruleLegend,
  ruleLinks,
  ruleLooks,
  ruleThings,
  rulesIn,
} from './rule-looks.ts';
export type { LookPart, RuleLegendEntry, RuleLooks, RuleMark } from './rule-looks.ts';
