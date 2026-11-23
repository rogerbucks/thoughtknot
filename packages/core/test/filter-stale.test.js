// A query that no longer fits the note (editor spec ES§75, ai_query_stale): filter-stale.ts and filter-replay.ts.
// - A rule naming a kind or a property the note no longer has is marked so, with the reason in words.
// - Its words are kept and Ask again is offered. Nothing is ever sent by itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gqlBlocks } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { queriesMerged, queryOf } from '../src/filter.ts';
import { savedQueryFrom } from '../src/filter-manage.ts';
import { savedQueryWritten } from '../src/filter-manage-note.ts';
import { savedQueryOpened } from '../src/filter-replay.ts';
import { queryStale } from '../src/filter-stale.ts';
import { ruleChoices } from '../src/rule-builder.ts';
import { readStyle } from '../src/style.ts';
import { CHOICES, DEAR, LATE, NOTE } from './filter-query-fixtures.js';

const texts = (note) => gqlBlocks(note).map((b) => b.text);
const choicesOf = (note) => ruleChoices(readNote(texts(note)).world.work);
const queriesOf = (note) => readStyle(texts(note), 'work', readNote(texts(note))).style.queries;
const saved = (note, name, q) => {
  const r = savedQueryWritten(note, 'work', savedQueryFrom(name, q));
  assert.ok('note' in r, r.refused);
  return r.note;
};

test('ai_query_stale: a rule fits while the note has its kind and properties', () => {
  assert.equal(queryStale(queryOf('q1', 'late tasks', LATE), CHOICES), null);
  assert.equal(queryStale(queryOf('q2', 'dear tasks', DEAR), CHOICES), null);
});

test('ai_query_stale: a property renamed marks the saved query as no longer fitting, with the reason', () => {
  const note = saved(NOTE, 'Late', queryOf('q1', 'late tasks', LATE));
  const renamed = note.replaceAll("status: '", "state: '");
  const [late] = queriesOf(renamed);
  const opened = savedQueryOpened(late, 'q9', choicesOf(renamed));
  assert.ok('query' in opened);
  assert.match(opened.stale, /no longer fits.*status/i);
  assert.equal(opened.query.words, 'late tasks', 'its words are kept');
  assert.match(opened.stale, /Ask again/, 'Ask again is offered');
  assert.ok(!(opened instanceof Promise), 'opened at once: it is given no send, so nothing is sent by itself');
});

test('ai_query_stale: a kind gone marks it too, its filter line read as written', () => {
  const note = saved(NOTE, 'Late', queryOf('q1', 'late tasks', LATE));
  const gone = note.replaceAll(':Task {', ':Job {');
  const [late] = queriesOf(gone);
  assert.equal(late.broken, undefined, 'not broken: its filter line is there');
  const opened = savedQueryOpened(late, 'q9', choicesOf(gone));
  assert.ok('query' in opened);
  assert.match(opened.stale, /no longer fits.*Task/i);
});

test('ai_query_stale: a merged query is marked when one of its parts no longer fits', () => {
  const merged = queriesMerged('m1', [queryOf('q1', 'late tasks', LATE), queryOf('q2', 'dear tasks', DEAR)], 'all');
  const note = saved(NOTE, 'Both', merged);
  const cheap = note.replaceAll(/cost: \d+/g, (s) => s.replace('cost', 'price'));
  const opened = savedQueryOpened(queriesOf(cheap)[0], 'q9', choicesOf(cheap));
  assert.ok('query' in opened);
  assert.match(opened.stale, /cost/);
});
