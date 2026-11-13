// Taking a saved rule out of the style graph, or moving it up (editor spec §56, rule_look_remove). Roger, 1 Nov 2026:
// a rule saved from the card must be removable from it too. Moving a rule up makes it win where two set one part
// (rule_look_order). The rule is found as a rule is changed in place: by its meaning, in
// its view. Its line is taken out of the style block with its comma, and nothing else in the note is touched. A rule
// not written, or written twice, is refused with the reason, so nothing is taken out by guess.
//
// Host-free and pure. The host keeps the note as it was, so one Undo puts the rule back where it was.
import { gqlSpans, styleOf } from './blocks.ts';
import { items } from './block-items.ts';
import { replaceBlock } from './store.ts';
import { word } from './words.ts';
import { writtenIn } from './written-things.ts';

/** The rule to take out: its meaning, and its view when it is a view's own. */
export interface RuleRemove {
  means: string;
  view?: string;
}

/** The block's text with the item that holds `at` taken out, with its comma, or the comma before it if last. */
export function without(text: string, at: number): string {
  const all = items(text),
    k = all.findIndex((it) => it.from <= at && at < it.to);
  const it = all[k];
  if (!it) return text;
  if (it.comma !== -1) {
    // its comma and the line break after it go too, so the next item takes its place
    let end = it.comma + 1;
    while (text[end] === ' ' || text[end] === '\t') end++;
    if (text[end] === '\n') end++;
    let start = it.from;
    while (start > 0 && (text[start - 1] === ' ' || text[start - 1] === '\t')) start--;
    return text.slice(0, start) + text.slice(end);
  }
  const before = all[k - 1];
  return before ? text.slice(0, before.comma) + text.slice(it.to) : text.slice(0, it.from) + text.slice(it.to);
}

/** The one style block of `graph` in `note` that writes the rule `r`, with the rule's place in it, or null. */
function foundIn(note: string, graph: string, r: RuleRemove) {
  const found = gqlSpans(note)
    .filter((s) => styleOf(s.text) === graph)
    .flatMap((s) =>
      writtenIn(s.text)
        .filter((w) => isRule(w) && w.props.get('means') === r.means && (w.props.get('view') ?? undefined) === r.view)
        .map((w) => ({ s, w })),
    );
  return found.length === 1 ? found[0] : null;
}

/** Whether a thing written is a rule: a Look with a test or a lens. */
const isRule = (w: ReturnType<typeof writtenIn>[number]) =>
  w.labels.includes('Look') && (w.props.has('when') || w.props.has('lens'));

/**
 * The note with the rule `r` of graph `graph` taken out of its style graph, or the reason nothing was. A rule is a
 * Look with a test or a lens; one with the same meaning in the same view is the one taken out.
 */
export function ruleRemoved(note: string, graph: string, r: RuleRemove): { note: string } | { refused: string } {
  const one = foundIn(note, graph, r);
  if (!one) return { refused: word('rules.remove-none', { means: r.means }) };
  const done = replaceBlock(note, { line: one.s.open, text: one.s.text }, without(one.s.text, one.w.open));
  return done.ok ? { note: done.note } : { refused: done.reason };
}

/**
 * The note with the rule `r` swapped with the rule before it in its block, so it is read first and wins a clash. It
 * says why not when the rule is not found, or is first already.
 */
export function ruleMovedUp(note: string, graph: string, r: RuleRemove): { note: string } | { refused: string } {
  const one = foundIn(note, graph, r);
  if (!one) return { refused: word('rules.remove-none', { means: r.means }) };
  const text = one.s.text,
    all = items(text),
    rules = writtenIn(text).filter(isRule);
  const before = rules[rules.findIndex((w) => w.open === one.w.open) - 1];
  const a = before && all.find((it) => it.from <= before.open && before.open < it.to),
    b = all.find((it) => it.from <= one.w.open && one.w.open < it.to);
  if (!a || !b || a === b) return { refused: word('rules.move-first', { means: r.means }) };
  const next =
    text.slice(0, a.from) +
    text.slice(b.from, b.to) +
    text.slice(a.to, b.from) +
    text.slice(a.from, a.to) +
    text.slice(b.to);
  const done = replaceBlock(note, { line: one.s.open, text }, next);
  return done.ok ? { note: done.note } : { refused: done.reason };
}
