// Words that fit no rule (editor spec ES§75, ai_query_fuzzy): filter-fuzzy.ts, through filter-send.ts.
// - Told so in words, with a suggested wording naming the note's properties.
// - Nothing more is sent to make the suggestion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmSend, prepareSend, sendPrepared } from '../src/ai.ts';
import { queryFitless } from '../src/filter-fuzzy.ts';
import { queryAsk, queryResult } from '../src/filter-send.ts';
import { BASE, CHOICES, G, LATE_ANSWER, answering } from './filter-query-fixtures.js';

/** What a query asked with `words` comes to when the model answers `answer`, and the sends made. */
const asked = async (words, answer) => {
  const sent = [];
  const p = prepareSend(queryAsk(BASE, 'work', CHOICES, null, words));
  assert.ok(!('refused' in p), p.refused);
  const result = await sendPrepared(p, confirmSend(p), { transport: answering(answer, sent), key: null });
  return { after: queryResult(null, words, result, G, CHOICES, 'q1'), sent };
};

test('ai_query_fuzzy: the suggestion names the note’s properties, made from its own names', () => {
  const said = queryFitless(CHOICES);
  assert.match(said, /fit no rule/);
  for (const name of ['status', 'cost', 'name']) assert.match(said, new RegExp(name));
  assert.match(said, /things whose status is/);
});

test('ai_query_fuzzy: an answer naming a property the note lacks is told so, with a wording to try', async () => {
  const { after, sent } = await asked('happy tasks', {
    ...LATE_ANSWER,
    tests: [{ field: 'mood', op: 'is', value: 'happy' }],
  });
  assert.ok('failed' in after);
  assert.match(after.failed, /fit no rule/);
  assert.match(after.failed, /status, cost/);
  assert.equal(after.words, 'happy tasks', 'the words are kept');
  assert.equal(sent.length, 1, 'nothing more was sent');
});

test('ai_query_fuzzy: an answer that is no filter on things is told so too, with nothing more sent', async () => {
  const links = { on: 'links', tests: [{ field: 'weight', op: 'is', value: 'x' }] };
  const { after, sent } = await asked('heavy links', links);
  assert.ok('failed' in after);
  assert.match(after.failed, /status, cost/);
  assert.equal(sent.length, 1);
});

test('ai_query_fuzzy: an answer that fits is filled, and told nothing more', async () => {
  const { after } = await asked('late tasks', LATE_ANSWER);
  assert.ok('query' in after, after.failed);
});
