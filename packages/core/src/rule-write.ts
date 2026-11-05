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
import type { RuleChoices } from './rule-builder.ts';

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
  /** Tried as taken out: in reading view a rule removed is only tried, as any change is (rule_look_remove). */
  removed?: boolean;
  /** Turned off: kept, but nothing drawn by it (rule_look_off). */
  off?: boolean;
  /** The meaning it had when opened to change, so a rule renamed is changed in place, never copied (rule_look_remove). */
  was?: string;
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
export function ruleProps(r: RuleWrite): [string, string | boolean | undefined][] {
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
    ['off', r.off ? true : undefined],
  ];
}

/** Whether a look is the rule `r` changes: a rule with the same meaning, in the same view. */
const sameRule = (l: Look, r: RuleWrite) =>
  (l.when !== undefined || l.lens !== undefined) && l.means === (r.was ?? r.means) && l.view === r.view;

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
      ...(r.off ? { off: true } : {}),
    };
    const at = looks.findIndex((l) => sameRule(l, r));
    if (r.removed) {
      if (at >= 0) looks.splice(at, 1); // tried as taken out: drawn as if it were gone
      return;
    }
    if (at >= 0) looks[at] = look;
    else looks.push(look);
  });
  return { ...style, looks };
}

/**
 * What a card may do with a rule: try it (reading view), or save it where the note is edited, and if any is tried.
 * With its graph it also says what a rule may be built from and what a rule being built finds. It lists the rules
 * saved that may be changed, and the rule last tried (rule_look_builder).
 */
export interface RuleAsk {
  tried: boolean;
  choices?: RuleChoices;
  finds?(rule: RuleWrite): { count: number; names: string[] };
  saved?: RuleWrite[];
  last?: RuleWrite;
  /** Takes a saved rule out of the style graph, where the note is edited (rule_look_remove). */
  remove?(rule: RuleWrite): void;
  /** The meaning of the rule just taken out, while one Undo can put it back. */
  removed?: string;
  /** Puts the rule just taken out back where it was. */
  undo?(): void;
  /** Moves a saved rule before the one above it, so it wins where two set one part (rule_look_order). */
  moveUp?(rule: RuleWrite): void;
  /**
   * Asks an AI to describe a rule from the person's words, where the host can (rule_look_describe). The host shows what
   * is sent and waits for a yes. `fill` is told the rule that comes back and only fills the form: nothing is tried or
   * saved by it.
   */
  describe?(words: string, fill: (rule: RuleWrite) => void): void;
  tryOut(rule: RuleWrite): void;
  save(rule: RuleWrite): void;
  /** Goes back to the rules as saved, forgetting those tried. */
  back(): void;
}

/** The rules of `looks` a person may change from the card: those with a test, as they would be written again. */
export function savedRules(looks: readonly Look[]): RuleWrite[] {
  return looks
    .filter((l) => l.when !== undefined && l.bands === undefined)
    .map((l) => {
      const r: RuleWrite = { means: l.means ?? '', ...(l.off ? { off: true } : {}) };
      for (const k of ['when', 'kind', 'type', 'view', 'colour', 'line', 'badge'] as const) {
        const v = l[k];
        if (typeof v === 'string') r[k] = v;
      }
      return r;
    });
}
