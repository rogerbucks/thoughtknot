// The words a person asked in stay beside the filter they became (editor spec ES§75, ai_query_words_kept). New words
// are sent with the filter as it stands. A hand edit marks the words as no longer matching. Each change can be stepped
// back to the one before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queryAnswered, queryAskWords, queryBack, queryEdited, queryOf } from '../src/filter-query.ts';
import { DEAR, LATE, LATE_RULE } from './filter-query-fixtures.js';

const late = queryOf('q1', 'late tasks', LATE);

test('ai_query_words_kept: the words stay with the filter they became, and match it', () => {
  assert.equal(late.words, 'late tasks');
  assert.equal(late.matches, true);
  const asked = queryAnswered(null, 'late tasks', LATE_RULE, 'q2');
  assert.equal(asked.words, 'late tasks');
  assert.deepEqual(asked.draft, LATE);
  assert.equal(asked.matches, true);
});

test('ai_query_words_kept: new words are sent with the filter as it stands', () => {
  assert.equal(queryAskWords(null, 'late tasks'), 'late tasks', 'a first ask sends the words alone');
  const sent = queryAskWords(late, 'only the dear ones');
  assert.match(sent, /Task where status is late/, 'the filter as it stands goes with them');
  assert.match(sent, /only the dear ones/);
  const changed = queryAnswered(late, 'only the dear ones', { kind: 'Task', when: 'cost > 40', means: '' });
  assert.equal(changed.words, 'only the dear ones');
  assert.deepEqual(changed.draft, DEAR);
  assert.equal(changed.id, 'q1', 'it is the same query, changed');
});

test('ai_query_words_kept: a hand edit marks the words as no longer matching, and new words match again', () => {
  const edited = queryEdited(late, DEAR);
  assert.deepEqual(edited.draft, DEAR);
  assert.equal(edited.words, 'late tasks', 'the words are kept, to edit');
  assert.equal(edited.matches, false);
  const again = queryAnswered(edited, 'late tasks', LATE_RULE);
  assert.equal(again.matches, true);
});

test('ai_query_words_kept: each change steps back to the one before', () => {
  const edited = queryEdited(late, DEAR);
  const reworded = queryAnswered(edited, 'late ones again', LATE_RULE);
  const one = queryBack(reworded);
  assert.deepEqual([one.words, one.draft, one.matches], ['late tasks', DEAR, false]);
  const two = queryBack(one);
  assert.deepEqual([two.words, two.draft, two.matches], ['late tasks', LATE, true]);
  assert.ok('refused' in queryBack(two), 'there is nothing before the first');
});
