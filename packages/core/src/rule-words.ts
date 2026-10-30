// The words of a rule's look in the style graph (editor spec §56). A Look with a `when` or a `lens` is a rule: it
// finds its own things, and gives each its look. Its badge is a second sign, so a look is never colour alone.

/** The keys a rule adds to a Look. */
export const RULE_KEYS = ['when', 'lens', 'badge'] as const;

/** The badges a rule's look may put on what it matches: a small sign beside a name (rule_look_not_colour_alone). */
export const BADGES = ['clock', 'flag', 'star', 'warning', 'check', 'cross', 'question', 'dot', 'up', 'down'] as const;
/** One of the badges. */
export type Badge = (typeof BADGES)[number];

/** What a rule adds to a look. */
export interface RuleParts {
  /** A short test of each thing's or link's properties, run as a lens query (rule_look_when). */
  when?: string;
  /** The Lens thing whose things take this look. */
  lens?: string;
  /** A rule on links: their relationship type. */
  type?: string;
  /** The rule's second sign beside its colour (rule_look_not_colour_alone). */
  badge?: Badge;
}

/** Whether a look is a rule's: one with a `when` or a `lens`. */
export const isRule = (l: RuleParts): boolean => l.when !== undefined || l.lens !== undefined;
