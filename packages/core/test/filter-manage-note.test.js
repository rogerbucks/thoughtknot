// A query saved by name, written to the note (editor spec ES§75, ai_query_saved): filter-manage-note.ts.
// - It is renamed in place. Removing it asks first, and takes out only its own lines. The graph is never changed.
// - A name a filter of its own holds is refused, and so is a merge holding another merge.
// - A filter line another name holds is left alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks, gqlSpans, styleOf } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { queriesMerged, queryOf } from '../src/filter.ts';
import { savedQueryFrom } from '../src/filter-manage.ts';
import {
  savedQueryRemove,
  savedQueryRemoved,
  savedQueryRenamed,
  savedQueryWritten,
} from '../src/filter-manage-note.ts';
import { readStyle } from '../src/style.ts';
import { styleEdit } from '../src/style-edit.ts';
import { DEAR, LATE, NOTE } from './filter-query-fixtures.js';

const texts = (note) => gqlBlocks(note).map((b) => b.text);
const data = (note) =>
  gqlSpans(note)
    .filter((s) => styleOf(s.text) === null)
    .map((s) => s.text);
const style = (note) => gqlSpans(note).find((s) => styleOf(s.text) === 'work')?.text ?? '';
const read = (note) => readStyle(texts(note), 'work', readNote(texts(note)));
const saved = (note, s) => {
  const r = savedQueryWritten(note, 'work', s);
  assert.ok('note' in r, r.refused);
  return r.note;
};
test('ai_query_saved: renamed in place, its own line and its filter line, and nothing else', () => {
  let note = saved(NOTE, savedQueryFrom('Late', queryOf('q1', 'late tasks', LATE)));
  note = saved(note, savedQueryFrom('Dear', queryOf('q2', 'dear tasks', DEAR)));
  const r = savedQueryRenamed(note, 'work', 'Late', 'Overdue');
  assert.ok('note' in r, r.refused);
  assert.equal(r.note.split('\n').length, note.split('\n').length, 'no line added or taken out');
  assert.equal(r.note.replaceAll('Overdue', 'Late'), note, 'only the name changed, where it was');
  const { style: s } = read(r.note);
  assert.deepEqual(
    s.queries.map((q) => [q.name, q.broken]),
    [
      ['Overdue', undefined],
      ['Dear', undefined],
    ],
  );
  assert.ok('refused' in savedQueryRenamed(r.note, 'work', 'Overdue', 'Dear'), 'a name taken is refused');
});

test('ai_query_saved: removing asks first; a no changes nothing, a yes takes out only its own lines', async () => {
  let note = saved(NOTE, savedQueryFrom('Late', queryOf('q1', 'late tasks', LATE)));
  note = saved(note, savedQueryFrom('Dear', queryOf('q2', 'dear tasks', DEAR)));
  const asked = [];
  let changed = note;
  const change = (edit) => {
    const r = edit(changed);
    if ('note' in r) changed = r.note;
  };
  const no = await savedQueryRemove('work', 'Late', { ask: (said) => (asked.push(said), false), change });
  assert.equal(no, false);
  assert.equal(changed, note, 'a no changes nothing');
  assert.match(asked[0], /Late/);
  const yes = await savedQueryRemove('work', 'Late', { ask: () => true, change });
  assert.equal(yes, true);
  assert.deepEqual(data(changed), data(NOTE), 'the graph is never changed');
  const { style: s } = read(changed);
  assert.deepEqual(
    s.queries.map((q) => q.name),
    ['Dear'],
  );
  assert.deepEqual(
    s.named.map((f) => f.name),
    ['Dear'],
    'its filter line went with it, and only that',
  );
});

test('ai_query_saved: a name a filter of its own holds is refused, so no filter is written over', () => {
  const filter = styleEdit(NOTE, 'work', { named: { name: 'Late', draft: LATE } });
  assert.ok('note' in filter, filter.refused);
  assert.ok('refused' in savedQueryWritten(filter.note, 'work', savedQueryFrom('Late', queryOf('q3', 'x', DEAR))));
});

test('ai_query_saved: a merge holding another merge is refused, never saved to read back broken', () => {
  const inner = queriesMerged('m1', [queryOf('q1', 'late tasks', LATE), queryOf('q2', 'dear tasks', DEAR)], 'any');
  const outer = queriesMerged('m2', [inner, queryOf('q3', 'dear again', DEAR)], 'all');
  assert.ok(!('refused' in outer));
  const r = savedQueryWritten(NOTE, 'work', savedQueryFrom('Nested', outer));
  assert.match(r.refused, /cannot be saved yet/);
});

test('ai_query_saved: a filter line another name holds is left alone when the query is renamed or removed', () => {
  let note = styleEdit(NOTE, 'work', { named: { name: 'Shared', draft: LATE } });
  assert.ok('note' in note, note.refused);
  note = note.note.replace(
    /\(named_1:NamedFilter[^)]*\)/,
    (m) => `${m},\n(query_1:SavedQuery {name: 'Mine', filter: 'Shared', words: '["late tasks"]', show: 'filter'})`,
  );
  const renamed = savedQueryRenamed(note, 'work', 'Mine', 'Ours');
  assert.ok('note' in renamed, renamed.refused);
  assert.match(style(renamed.note), /NamedFilter \{name: 'Shared'/);
  assert.match(style(renamed.note), /SavedQuery \{name: 'Ours', filter: 'Shared'/);
  const removed = savedQueryRemoved(renamed.note, 'work', 'Ours');
  assert.ok('note' in removed, removed.refused);
  assert.doesNotMatch(style(removed.note), /SavedQuery/);
  assert.match(style(removed.note), /NamedFilter \{name: 'Shared'/, 'the shared filter stays');
});
