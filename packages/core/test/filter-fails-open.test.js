// A query that fails never hides the graph silently (editor spec ES§75, ai_query_fails_open). When the AI cannot be
// reached, its answer is refused, or the filter keeps nothing, the person is told why in words. The graph stays shown
// as it was, and their words are kept to try again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmSend, prepareSend, sendPrepared } from '../src/ai.ts';
import { queryAsk, queryOf, queryResult } from '../src/filter-query.ts';
import { BASE, CHOICES, G, LATE, LATE_ANSWER, answering } from './filter-query-fixtures.js';

const late = queryOf('q1', 'late tasks', LATE);
const sendWith = async (q, words, transport) => {
  const p = prepareSend(queryAsk(BASE, 'work', CHOICES, q, words));
  return queryResult(q, words, await sendPrepared(p, confirmSend(p), { transport, key: null }), G, CHOICES);
};
const failsOpen = (after, before, words) => {
  assert.ok('failed' in after);
  assert.ok(after.failed.trim().length > 10, 'it says why in words');
  assert.match(after.failed, /as it was/, 'and that the graph is shown as before');
  assert.equal(after.query, before, 'the graph is shown with what was shown before');
  assert.equal(after.words, words, 'the words are kept to try again');
};

test('ai_query_fails_open: an AI that cannot be reached says why and changes nothing', async () => {
  const down = async () => {
    throw new Error('connect ECONNREFUSED');
  };
  const after = await sendWith(late, 'dear ones', down);
  failsOpen(after, late, 'dear ones');
  assert.match(after.failed, /ECONNREFUSED|reach/);
  failsOpen(await sendWith(null, 'late tasks', down), null, 'late tasks');
});

test('ai_query_fails_open: a refused answer says why and changes nothing', async () => {
  const refusing = async () => ({ status: 500, text: 'server error' });
  failsOpen(await sendWith(late, 'dear ones', refusing), late, 'dear ones');
  failsOpen(await sendWith(late, 'dear ones', answering('not json at all')), late, 'dear ones');
  const notSent = queryResult(late, 'dear ones', { refused: 'AI is off.' }, G, CHOICES);
  failsOpen(notSent, late, 'dear ones');
  assert.match(notSent.failed, /AI is off/);
});

test('ai_query_fails_open: a filter that keeps nothing says so and changes nothing', async () => {
  const none = { ...LATE_ANSWER, tests: [{ field: 'status', op: 'is', value: 'lost' }] };
  const after = await sendWith(late, 'lost tasks', answering(none));
  failsOpen(after, late, 'lost tasks');
  assert.match(after.failed, /nothing/);
});

test('ai_query_fails_open: a question back is told, and the words are kept', async () => {
  const after = await sendWith(late, 'the odd ones', answering({ question: 'Odd in what way?' }));
  assert.match(after.failed, /Odd in what way\?/);
  assert.equal(after.query, late);
  assert.equal(after.words, 'the odd ones');
});

test('ai_query_fails_open: an answer that keeps something fills the query', async () => {
  const after = await sendWith(null, 'late tasks', answering(LATE_ANSWER));
  assert.ok('query' in after && !('failed' in after));
  assert.deepEqual(after.query.draft, LATE);
  assert.equal(after.query.words, 'late tasks');
});
