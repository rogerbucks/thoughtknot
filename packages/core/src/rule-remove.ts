// Taking a saved rule out of the style graph (editor spec §56, rule_look_remove). Roger, 1 Nov 2026: a rule saved
// from the card must be removable from it too. The rule is found as a rule is changed in place: by its meaning, in
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
function without(text: string, at: number): string {
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

/**
 * The note with the rule `r` of graph `graph` taken out of its style graph, or the reason nothing was. A rule is a
 * Look with a test or a lens; one with the same meaning in the same view is the one taken out.
 */
export function ruleRemoved(note: string, graph: string, r: RuleRemove): { note: string } | { refused: string } {
  const found = gqlSpans(note)
    .filter((s) => styleOf(s.text) === graph)
    .flatMap((s) =>
      writtenIn(s.text)
        .filter(
          (w) =>
            w.labels.includes('Look') &&
            (w.props.has('when') || w.props.has('lens')) &&
            w.props.get('means') === r.means &&
            (w.props.get('view') ?? undefined) === r.view,
        )
        .map((w) => ({ s, w })),
    );
  const one = found[0];
  if (!one || found.length > 1) return { refused: word('rules.remove-none', { means: r.means }) };
  const done = replaceBlock(note, { line: one.s.open, text: one.s.text }, without(one.s.text, one.w.open));
  return done.ok ? { note: done.note } : { refused: done.reason };
}
