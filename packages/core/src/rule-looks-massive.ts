// Rules and looks on a graph too large to draw (editor spec §56, rule_look_massive). Its overview shows each group as
// a box. So each box says how many of its things each look holds, with the look's badge and meaning. The filters offer
// the looks as a facet too, "By look", with counts that follow the other filters (scale_facet_counts).
//
// Host-free and pure. The looks are those `rulesFor` gives the whole graph (rule-looks.ts).
import type { Facet } from './facet-counts.ts';
import { formatCount } from './locale-formats.ts';
import { BADGE_GLYPHS } from './rule-looks.ts';
import type { RuleLegendEntry, RulesShown } from './rule-looks.ts';
import { word } from './words.ts';

/** How many of some things one look holds: its token, the glyph and meaning the legend shows, and the count. */
export interface LookCount {
  token: string;
  glyph: string;
  means: string;
  count: number;
}

/** A legend entry's glyph: its badge, or the numbered tag of a bands rule's step. */
const glyphOf = (e: RuleLegendEntry) => (e.badge ? BADGE_GLYPHS[e.badge] : (e.tag ?? ''));

/** How many of `keys` each look of `rules` holds, in the legend's order, leaving out those that hold none. */
export function lookCounts(keys: readonly string[], rules: Pick<RulesShown, 'things' | 'legend'>): LookCount[] {
  const n = new Map<string, number>();
  for (const key of keys)
    for (const token of rules.things.get(key)?.tokens ?? []) n.set(token, (n.get(token) ?? 0) + 1);
  return rules.legend
    .map((e) => ({ token: e.token, glyph: glyphOf(e), means: e.means, count: n.get(e.token) ?? 0 }))
    .filter((c) => c.count > 0);
}

/** The counts as the words under a group's name, such as "⏱ Late 12 · ⚑ Behind 3"; empty when no look holds any. */
export function lookCountsSaid(counts: readonly LookCount[]): string {
  return counts
    .map((c) => word('massive.look-count', { look: `${c.glyph} ${c.means}`.trim(), n: formatCount(c.count) }))
    .join(' · ');
}

/** What a group box says of its things' looks, for the overview (overview.ts): its keys' counts, in words. */
export function groupLooks(rules: Pick<RulesShown, 'things' | 'legend'>): (keys: readonly string[]) => string {
  return (keys) => lookCountsSaid(lookCounts(keys, rules));
}

/**
 * The "By look" facet of `keys`: each thing's look, by the meaning of the first rule that gives it one. A thing no rule
 * finds has none. Null when no rule finds any thing, so the filters offer no empty list.
 */
export function lookFacet(keys: readonly string[], rules: Pick<RulesShown, 'things' | 'legend'>): Facet | null {
  const named = new Map(rules.legend.map((e) => [e.token, `${glyphOf(e)} ${e.means}`.trim()]));
  const values = keys.map((key) => {
    const token = rules.things.get(key)?.tokens[0];
    return token === undefined ? undefined : named.get(token);
  });
  return values.some((v) => v !== undefined) ? { name: word('massive.by-look'), values } : null;
}
