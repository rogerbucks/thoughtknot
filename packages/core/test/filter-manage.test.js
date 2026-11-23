// A query saved by name (editor spec ES§75, ai_query_saved): filter-manage.ts and filter-manage-note.ts.
// - Saved, it keeps its words, each prompt in order, how it is shown and its lock. Its filter is its NamedFilter line.
// - A merged query keeps each part's words, rule and mark itself, so taking out another query never breaks it.
// - It is renamed in place. Removing it asks first, and takes out only its own lines. The graph is never changed.
// - One whose filter line is gone reads as broken, with the reason. It is never dropped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks, gqlSpans, styleOf } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { queriesMerged, queryAnswered, queryLocked, queryOf, queryShown } from '../src/filter.ts';
import { queryPrompts, savedQueryFrom } from '../src/filter-manage.ts';
import {
  savedQueryRemove,
  savedQueryRemoved,
  savedQueryRenamed,
  savedQueryWritten,
} from '../src/filter-manage-note.ts';
import { namedFilterRemoved } from '../src/filter-named.ts';
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
/** Late tasks, refined to the dear ones: two prompts, in order. */
const refined = () => {
  const first = queryOf('q1', 'late tasks', LATE);
  const next = queryAnswered(first, 'only the dear ones', { kind: 'Task', when: 'cost > 40', means: 'Dear' });
  assert.ok(!('refused' in next));
  return queryLocked(queryShown(next, 'highlight'), true);
};

test('ai_query_saved: a query saved keeps each prompt in order, how it is shown, its lock and its filter', () => {
  const q = refined();
  assert.deepEqual(queryPrompts(q), ['late tasks', 'only the dear ones']);
  const note = saved(NOTE, savedQueryFrom('Dear', q));
  assert.deepEqual(data(note), data(NOTE), 'the data is never touched');
  assert.match(style(note), /\(named_1:NamedFilter \{name: 'Dear', kind: 'Task', when: 'cost > 40'\}\)/);
  assert.match(
    style(note),
    /\(query_1:SavedQuery \{name: 'Dear', filter: 'Dear', words: .*show: 'highlight', locked: true\}\)/,
  );
  const { style: s, problems } = read(note);
  assert.deepEqual(problems, []);
  const [back] = s.queries;
  assert.deepEqual(back.words, ['late tasks', 'only the dear ones']);
  assert.equal(back.show, 'highlight');
  assert.equal(back.locked, true);
  assert.deepEqual(back.draft, { on: 'things', of: 'Task', tests: [{ field: 'cost', op: 'more', value: '40' }] });
  assert.equal(back.broken, undefined);
});

test('ai_query_saved: saved again by the same name it is changed in place', () => {
  let note = saved(NOTE, savedQueryFrom('Late', queryOf('q1', 'late tasks', LATE)));
  note = saved(note, savedQueryFrom('Late', queryShown(queryOf('q1', 'late tasks', LATE), 'highlight')));
  const { style: s } = read(note);
  assert.equal(s.queries.length, 1);
  assert.equal(s.queries[0].show, 'highlight');
  assert.equal(s.named.length, 1);
});

test('ai_query_saved: a merged query keeps each part whole, so taking out another query never breaks it', () => {
  const late = queryOf('q1', 'late tasks', LATE);
  const dear = queryOf('q2', 'dear tasks', DEAR);
  const merged = queriesMerged('m1', [late, dear], 'any');
  let note = saved(NOTE, savedQueryFrom('Late', late));
  note = saved(note, savedQueryFrom('Either', merged));
  assert.doesNotMatch(style(note), /NamedFilter \{name: 'Either'/, 'a merge writes no filter line');
  const r = savedQueryRemoved(note, 'work', 'Late');
  assert.ok('note' in r, r.refused);
  const { style: s, problems } = read(r.note);
  assert.deepEqual(problems, []);
  assert.deepEqual(
    s.queries.map((q) => q.name),
    ['Either'],
  );
  const [either] = s.queries;
  assert.equal(either.broken, undefined);
  assert.equal(either.join, 'any');
  assert.deepEqual(
    either.parts.map((p) => [p.words, p.draft, p.mark]),
    merged.parts.map((p) => [[p.words], p.draft, p.mark]),
  );
});

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

test('ai_query_saved: a query whose filter line is gone reads as broken with the reason, never dropped', () => {
  const note = saved(NOTE, savedQueryFrom('Late', queryOf('q1', 'late tasks', LATE)));
  const r = namedFilterRemoved(note, 'work', 'Late');
  assert.ok('note' in r, r.refused);
  const { style: s } = read(r.note);
  assert.equal(s.queries.length, 1, 'still listed');
  assert.match(s.queries[0].broken, /broken.*Late.*gone/);
  assert.deepEqual(s.queries[0].words, ['late tasks'], 'its words are kept');
});

test('ai_query_saved: a name a filter of its own holds is refused, so no filter is written over', () => {
  const filter = styleEdit(NOTE, 'work', { named: { name: 'Late', draft: LATE } });
  assert.ok('note' in filter, filter.refused);
  assert.ok('refused' in savedQueryWritten(filter.note, 'work', savedQueryFrom('Late', queryOf('q3', 'x', DEAR))));
});

test('ai_query_saved: a part whose mark has a colour no mark has reads as broken, so nothing draws an unknown hue', () => {
  const merged = queriesMerged('m1', [queryOf('q1', 'late tasks', LATE), queryOf('q2', 'dear tasks', DEAR)], 'all');
  const note = saved(NOTE, savedQueryFrom('Both', merged)).replace(/"colour":"[a-z]+"/, '"colour":"teal"');
  assert.match(note, /teal/);
  const [q] = read(note).style.queries;
  assert.match(q.broken, /merged parts cannot be read/);
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
