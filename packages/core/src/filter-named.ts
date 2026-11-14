// A filter saved by name, to pick again (editor spec ES§25, untangle_filter_saved). Roger, 13 Nov 2026: "also allow a
// save of the query tree". The filter a person built, or an AI filled, is saved as one NamedFilter line in the graph's
// style block, where the note is edited:
//
//   (named_1:NamedFilter {name: 'Open risks of Sam', kind: 'Risk', when: 'owner == "Sam" and status == "open"'})
//
// `kind` is optional. `when` is read back by the filter's own builder (rule-builder.ts, `testsOf`), so only tests it
// writes are kept: no other text is ever run. Saved again under the same name, it is changed in place. Taken out, it
// goes with its comma, and the host keeps the note as it was, so one Undo puts it back.
//
// Host-free and pure.
import { gqlSpans, styleOf } from './blocks.ts';
import type { Problem } from './note-reading.ts';
import { testsOf, whenOf } from './rule-builder.ts';
import type { RuleDraft } from './rule-builder.ts';
import { without } from './rule-remove.ts';
import type { RawThing, StyledNames } from './style-checks.ts';
import type { StyleAt } from './style-graph.ts';
import { reader } from './style-reader.ts';
import { replaceBlock } from './store.ts';
import { word } from './words.ts';
import { writtenIn } from './written-things.ts';

/** The style graph's kind for a filter saved by name. */
export const NAMED_FILTER = 'NamedFilter';

/** A filter to save: its name, and the filter as the builder holds it. */
export interface NamedFilterSave {
  name: string;
  draft: RuleDraft;
}

/** A filter saved by name, read from the style graph and checked. */
export interface NamedFilter extends NamedFilterSave {
  at: StyleAt;
}

/** The filters a card can pick again, and, where the note is edited, how to save one or take one out. */
export interface NamedFilters {
  saved: readonly NamedFilterSave[];
  save?: (f: NamedFilterSave) => void;
  remove?: (name: string) => void;
}

/**
 * Why `f` cannot be saved, or null: it has no name, or nothing to filter by. Or its tests would not read back as they
 * are, such as a value holding the word and. Refused, no filter is saved that then goes missing.
 */
export function namedFilterRefusal(f: NamedFilterSave): string | null {
  if (!f.name.trim()) return word('styling.named.no-name');
  const when = whenOf(f.draft);
  if (!when) return word('styling.named.empty', { name: f.name });
  const filled = f.draft.tests.filter((t) => t.field.trim() && t.value.trim());
  const back = testsOf(when);
  const same =
    back?.length === filled.length &&
    back.every((t, i) => t.field === filled[i]?.field.trim() && t.op === filled[i].op && t.value === filled[i].value);
  return same ? null : word('styling.named.unreadable', { name: f.name });
}

/** The NamedFilter line `f` writes, changed in place for the same name, or why it cannot be written. */
export function namedFilterThing(f: NamedFilterSave) {
  const why = namedFilterRefusal(f);
  if (why) return { refused: why };
  const name = f.name.trim();
  return {
    kind: NAMED_FILTER,
    props: [
      ['name', name],
      ['kind', f.draft.of || undefined],
      ['when', whenOf(f.draft)],
    ] as [string, string | undefined][],
    match: [['name', name]] as [string, string][],
  };
}

/**
 * A NamedFilter, checked against the graph it styles. It needs a name and tests the builder can read. A kind the graph
 * lacks is a problem with its fix. Without a name or readable tests it is a problem, and left out.
 */
export function namedFilterOf(raw: RawThing, names: StyledNames, out: Problem[]): NamedFilter | null {
  const r = reader(raw, names, out);
  const name = r.text('name')?.trim();
  if (!name) {
    r.missing(word('styling.named.name'), word('styling.named.name.fix'));
    return null;
  }
  const when = r.text('when');
  const tests = when === undefined ? null : testsOf(when);
  if (!tests) {
    r.report(word('styling.named.when', { name }), word('styling.named.when.fix'));
    return null;
  }
  const kind = r.text('kind') === undefined ? '' : r.name('kind', names.kinds, word('styling.what.kind'));
  if (kind === undefined) return null;
  return { name, draft: { on: 'things', of: kind, tests }, at: raw.at };
}

/** The filters saved by name, each name once: the first written wins, as a reader reads the first. */
export function namedFiltersOf(all: readonly NamedFilter[]): NamedFilterSave[] {
  const seen = new Set<string>();
  return all.filter((f) => !seen.has(f.name) && seen.add(f.name)).map(({ name, draft }) => ({ name, draft }));
}

/** The note with the filter named `name` taken out of the style graph of `graph`, or why nothing was. */
export function namedFilterRemoved(note: string, graph: string, name: string): { note: string } | { refused: string } {
  const found = gqlSpans(note)
    .filter((s) => styleOf(s.text) === graph)
    .flatMap((s) =>
      writtenIn(s.text)
        .filter((w) => w.labels.includes(NAMED_FILTER) && w.props.get('name') === name)
        .map((w) => ({ s, w })),
    );
  const one = found.length === 1 ? found[0] : null;
  if (!one) return { refused: word('styling.named.none', { name }) };
  const done = replaceBlock(note, { line: one.s.open, text: one.s.text }, without(one.s.text, one.w.open));
  return done.ok ? { note: done.note } : { refused: done.reason };
}
