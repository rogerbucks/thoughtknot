// What saving, renaming and removing a saved query does to the note (editor spec ES§75, ai_query_saved). Each changes
// only the query's own lines in the graph's style block: its SavedQuery line and its NamedFilter line. The data is
// never touched. Removing asks first. The line model is filter-manage.ts.
//
// Host-free and pure, but for the ask before removing, which waits for the person.
import { gqlSpans, styleOf } from './blocks.ts';
import { NAMED_FILTER, namedFilterRemoved } from './filter-named.ts';
import { SAVED_QUERY } from './filter-manage.ts';
import type { SavedQuerySave } from './filter-manage.ts';
import { quoted } from './lock.ts';
import { without } from './rule-remove.ts';
import { replaceBlock } from './store.ts';
import { styleEdit } from './style-edit.ts';
import { word } from './words.ts';
import { writtenIn } from './written-things.ts';

/** The note changed, or why not. */
export type NoteEdit = { note: string } | { refused: string };

/** Each line of `kind` named `name` in the style of `graph`, with its block. */
const linesNamed = (note: string, graph: string, kind: string, name: string) =>
  gqlSpans(note)
    .filter((s) => styleOf(s.text) === graph)
    .flatMap((s) =>
      writtenIn(s.text)
        .filter((w) => w.writes && w.labels.includes(kind) && w.props.get('name') === name)
        .map((w) => ({ s, w })),
    );

/**
 * The note with `s` saved: its filter as a NamedFilter line, then its SavedQuery line, each changed in place for the
 * same name. A merged query writes no filter line. Refused for a name a filter of its own already holds.
 */
export function savedQueryWritten(note: string, graph: string, s: SavedQuerySave): NoteEdit {
  const name = s.name.trim();
  if (!name) return { refused: word('styling.named.no-name') };
  // a part merged itself has no filter of its own to keep, so it would read back broken
  if (s.parts?.some((p) => p.draft.tests.every((t) => !t.field.trim())))
    return { refused: word('filter.saved-query.nested') };
  const mine = linesNamed(note, graph, SAVED_QUERY, name).length > 0;
  const filter = linesNamed(note, graph, NAMED_FILTER, name).length > 0;
  if (!mine && filter) return { refused: word('filter.saved-query.taken', { name }) };
  let now: NoteEdit = { note };
  if (s.draft) now = styleEdit(note, graph, { named: { name, draft: s.draft } });
  else if (filter) now = namedFilterRemoved(note, graph, name); // saved again merged: its old filter line goes
  return 'refused' in now ? now : styleEdit(now.note, graph, { query: { ...s, name } });
}

/** The line of `w` in block `s` of `note` with `key`'s quoted value set to `value`, in place. */
function propSet(note: string, at: ReturnType<typeof linesNamed>[number], key: string, value: string): NoteEdit {
  const { s, w } = at;
  const thing = s.text.slice(w.open, w.close + 1);
  const set = thing.replace(
    new RegExp(`(\\b${key}\\s*:\\s*)'(?:[^'\\\\]|\\\\.)*'`),
    (_, lead: string) => lead + quoted(value),
  );
  const done = replaceBlock(
    note,
    { line: s.open, text: s.text },
    s.text.slice(0, w.open) + set + s.text.slice(w.close + 1),
  );
  return done.ok ? { note: done.note } : { refused: done.reason };
}

/** The note with the saved query `from` renamed `to` in place: its own line and its filter line, nothing else. */
export function savedQueryRenamed(note: string, graph: string, from: string, to: string): NoteEdit {
  const name = to.trim();
  if (!name) return { refused: word('styling.named.no-name') };
  if (name === from) return { note };
  const taken = [SAVED_QUERY, NAMED_FILTER].some((k) => linesNamed(note, graph, k, name).length);
  if (taken) return { refused: word('filter.saved-query.taken', { name }) };
  const [query, ...more] = linesNamed(note, graph, SAVED_QUERY, from);
  if (!query || more.length) return { refused: word('filter.saved-query.none', { name: from }) };
  // only its own filter line, of the same name, is renamed with it; one it shares stays as it is
  const filter = query.w.props.get('filter') === from ? from : undefined;
  let now = propSet(note, query, 'name', name);
  if ('refused' in now || !filter) return now;
  now = propSet(now.note, linesNamed(now.note, graph, SAVED_QUERY, name)[0] ?? query, 'filter', name);
  const line = 'note' in now ? linesNamed(now.note, graph, NAMED_FILTER, filter)[0] : undefined;
  return 'refused' in now || !line ? now : propSet(now.note, line, 'name', name);
}

/** The note with the saved query `name` taken out: its own line, and its filter line if still there. */
export function savedQueryRemoved(note: string, graph: string, name: string): NoteEdit {
  const [query, ...more] = linesNamed(note, graph, SAVED_QUERY, name);
  if (!query || more.length) return { refused: word('filter.saved-query.none', { name }) };
  const { s, w } = query;
  const done = replaceBlock(note, { line: s.open, text: s.text }, without(s.text, w.open));
  if (!done.ok) return { refused: done.reason };
  const filter = w.props.get('filter') === name ? name : undefined; // only its own filter line
  if (!filter || !linesNamed(done.note, graph, NAMED_FILTER, filter).length) return { note: done.note };
  return namedFilterRemoved(done.note, graph, filter);
}

/**
 * Takes out the saved query `name`, once the person says yes to what `ask` shows. A no changes nothing. `change` runs
 * the edit on the note as it is then. Whether it was taken out.
 */
export async function savedQueryRemove(
  graph: string,
  name: string,
  deps: { ask: (said: string) => boolean | Promise<boolean>; change: (edit: (note: string) => NoteEdit) => unknown },
): Promise<boolean> {
  if (!(await deps.ask(word('filter.saved-query.remove-ask', { name })))) return false;
  await deps.change((note) => savedQueryRemoved(note, graph, name));
  return true;
}
