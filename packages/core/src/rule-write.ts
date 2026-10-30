// A rule added or changed from the card (editor spec §56, rule_look_try_save). In reading view it is only tried: the
// card draws it, and the note is left as it was. Where the note is edited it is saved: written into the style graph as
// a Look, as style-edit.ts writes every style change. A rule with the same meaning in the same view is changed in
// place, so changing a rule never writes it twice.
//
// Host-free and pure. A rule is checked as the style graph checks it when read (rule-look-checks.ts), so nothing
// written is read back as a fault.
import gs from '@thoughtknot/graph-spec';
import { BADGES } from './rule-words.ts';
import type { Badge } from './rule-words.ts';
import { LINES, STYLE_HUES, orList } from './style-graph.ts';
import type { LineStyle, Look, StyleGraph } from './style-graph.ts';
import { word } from './words.ts';

/** A rule to try or save: its test or lens, what it may name, its look and what it means. */
export interface RuleWrite {
  when?: string;
  lens?: string;
  kind?: string;
  type?: string;
  view?: string;
  colour?: string;
  line?: string;
  badge?: string;
  means: string;
}

/** That `key` must be one of `among`. */
const mustBe = (key: string, among: readonly string[]) => word('styling.must-be', { key, among: orList(among) });

/**
 * Why a rule cannot be tried or saved, or null. It has a test or names a lens, not both, and a test that reads. It
 * names a kind or a type, not both. Its badge, line and colour are the style graph's. It gives a badge or a line, so it
 * is never told by colour alone, and says what it means.
 */
export function ruleRefusal(r: RuleWrite): string | null {
  if (!r.when === !r.lens) return r.when ? word('styling.rule.when-and-lens') : word('editing.style.rule-test');
  const unread = r.when === undefined ? null : gs.guardProblem(r.when);
  if (unread) return word('styling.rule.when-unread', { why: unread });
  if (r.kind && r.type) return word('styling.rule.target');
  if (r.badge && !(BADGES as readonly string[]).includes(r.badge)) return mustBe('badge', BADGES);
  if (r.line && !(LINES as readonly string[]).includes(r.line)) return mustBe('line', LINES);
  if (r.colour && !STYLE_HUES.includes(r.colour)) return word('styling.look.colour-unknown', { written: r.colour });
  if (!r.badge && !r.line) return word('styling.rule.second-sign');
  if (!r.means.trim()) return word('styling.rule.means');
  return null;
}

/** The rule's properties in the order the style graph writes them, those not given left out. */
export function ruleProps(r: RuleWrite): [string, string | undefined][] {
  return [
    ['when', r.when],
    ['lens', r.lens],
    ['kind', r.kind],
    ['type', r.type],
    ['view', r.view],
    ['colour', r.colour],
    ['line', r.line],
    ['badge', r.badge],
    ['means', r.means],
  ];
}

/** Whether a look is the rule `r` changes: a rule with the same meaning, in the same view. */
const sameRule = (l: Look, r: RuleWrite) =>
  (l.when !== undefined || l.lens !== undefined) && l.means === r.means && l.view === r.view;

/**
 * `style` with the rules tried drawn as if saved. Each changes the rule with its meaning in its view, or is added after
 * the rules written. Each is named `tried_<n>`, so its token says it is only tried. The note is never read.
 */
export function withTriedRules(style: StyleGraph, tried: readonly RuleWrite[]): StyleGraph {
  if (!tried.length) return style;
  const looks = [...style.looks];
  tried.forEach((r, n) => {
    const look: Look = {
      at: { block: -1, line: 0, id: `tried_${n + 1}` },
      means: r.means,
      ...(r.when !== undefined ? { when: r.when } : { lens: r.lens }),
      ...(r.kind ? { kind: r.kind } : {}),
      ...(r.type ? { type: r.type } : {}),
      ...(r.view ? { view: r.view } : {}),
      ...(r.colour ? { colour: r.colour } : {}),
      ...(r.line ? { line: r.line as LineStyle } : {}),
      ...(r.badge ? { badge: r.badge as Badge } : {}),
    };
    const at = looks.findIndex((l) => sameRule(l, r));
    if (at >= 0) looks[at] = look;
    else looks.push(look);
  });
  return { ...style, looks };
}

/** What a card may do with a rule: try it (reading view), or save it where the note is edited, and if any is tried. */
export interface RuleAsk {
  tried: boolean;
  tryOut(rule: RuleWrite): void;
  save(rule: RuleWrite): void;
  /** Goes back to the rules as saved, forgetting those tried. */
  back(): void;
}
