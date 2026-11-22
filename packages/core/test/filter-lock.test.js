// A locked query stays put (editor spec ES§75, ai_query_lock). While locked, its words and filter cannot be changed by
// asking again, by an AI or by hand. It goes on applying as the graph changes, and shows a lock mark until unlocked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareSend } from '../src/ai.ts';
import {
  queryAnswered,
  queryAsk,
  queryAskWords,
  queryBack,
  queryEdited,
  queryKeeps,
  queryLocked,
  queryOf,
  querySaid,
} from '../src/filter-query.ts';
import { BASE, CHOICES, DEAR, GRAPH, G, LATE, LATE_RULE, graphOf } from './filter-query-fixtures.js';

const late = queryEdited(queryOf('q1', 'late tasks', DEAR), LATE);
const locked = queryLocked(late, true);

test('ai_query_lock: a locked query refuses every change, by words, by an AI or by hand', () => {
  assert.equal(locked.locked, true);
  assert.ok('refused' in queryAskWords(locked, 'dear ones'), 'asking again');
  assert.ok('refused' in queryAsk(BASE, 'work', CHOICES, locked, 'dear ones'), 'nothing is sent for it');
  assert.ok('refused' in queryAnswered(locked, 'dear ones', LATE_RULE), 'an AI’s answer');
  assert.ok('refused' in queryEdited(locked, DEAR), 'a hand edit');
  assert.ok('refused' in queryBack(locked), 'a step back');
  assert.deepEqual([locked.words, locked.draft], ['late tasks', LATE], 'it is as it was');
});

test('ai_query_lock: a locked query still applies after the graph changes', () => {
  assert.deepEqual([...queryKeeps(G, locked, CHOICES)].sort(), ['floor', 'roof']);
  const changed = graphOf(GRAPH.replace("status: 'done'", "status: 'late'"));
  assert.deepEqual([...queryKeeps(changed, locked, CHOICES)].sort(), ['floor', 'roof', 'walls']);
});

test('ai_query_lock: it shows a lock mark until unlocked, then changes again', () => {
  assert.match(querySaid(locked), /🔒|locked/i);
  const open = queryLocked(locked, false);
  assert.doesNotMatch(querySaid(open), /🔒|locked/i);
  assert.deepEqual(queryEdited(open, DEAR).draft, DEAR);
  const ask = queryAsk(BASE, 'work', CHOICES, open, 'dear ones');
  assert.ok(!('refused' in ask));
  assert.ok(!('refused' in prepareSend(ask)), 'unlocked, it can be asked again');
});
