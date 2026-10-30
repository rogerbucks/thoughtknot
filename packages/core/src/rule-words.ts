// The words of a rule's look in the style graph (editor spec §56). A Look with a `when` or a `lens` is a rule: it
// finds its own things, and gives each its look. Its badge is a second sign, so a look is never colour alone.

/** The keys a rule adds to a Look. */
export const RULE_KEYS = ['when', 'lens', 'badge', 'bands', 'steps'] as const;

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
  /** A bands rule (rule_look_bands): the number property shaded in steps. */
  bands?: string;
  /** Where each step after the first starts, in rising order. */
  steps?: number[];
}

/**
 * The palette's colours in order, from cool to warm, that a bands rule shades its steps with. A rule of fewer steps
 * takes them spread out, so its first and last are always the coolest and the warmest.
 */
export const BAND_HUES = ['blue', 'cyan', 'green', 'yellow', 'orange', 'red'] as const;
/** The most steps a bands rule may draw: one for each colour. */
export const MOST_STEPS = BAND_HUES.length;

/** The hues of a bands rule of `n` steps, spread across the ordered colours. */
export const bandHues = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => BAND_HUES[n < 2 ? 0 : Math.round((i * (MOST_STEPS - 1)) / (n - 1))] ?? 'blue');

/** Whether a look is a rule's: one with a `when`, a `lens` or `bands`. */
export const isRule = (l: RuleParts): boolean => l.when !== undefined || l.lens !== undefined || l.bands !== undefined;
