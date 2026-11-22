// Every send for a query keeps the AI rules (editor spec ES§75, ai_query_sends_ruled; ES§19). That holds asked the
// first time, refined or merged. AI is off until chosen, and nothing above the model's ceiling goes. Each send is
// recorded with what it held. The answer is checked as untrusted before it fills anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmSend, prepareSend, sendPrepared } from '../src/ai.ts';
import { settingsFrom } from '../src/settings.ts';
import { queriesMerged, queryOf } from '../src/filter.ts';
import { queryAsk, queryResult } from '../src/filter-send.ts';
import { BASE, CHOICES, DEAR, G, LATE, LATE_ANSWER, answering } from './filter-query-fixtures.js';

const late = queryOf('q1', 'late tasks', LATE);
const merged = queriesMerged('m1', [late, queryOf('q2', 'dear tasks', DEAR)], 'all');
const KINDS = [
  ['asked the first time', null],
  ['refined', late],
  ['merged', merged],
];

test('ai_query_sends_ruled: no query is sent while AI is off', () => {
  const off = { ...BASE, settings: settingsFrom({ aiUse: 'off' }) };
  for (const [what, q] of KINDS) assert.ok('refused' in prepareSend(queryAsk(off, 'work', CHOICES, q, 'x')), what);
});

test('ai_query_sends_ruled: nothing above the model’s ceiling is sent', () => {
  const above = { ...BASE, level: 'Confidential' };
  for (const [what, q] of KINDS) assert.ok('refused' in prepareSend(queryAsk(above, 'work', CHOICES, q, 'x')), what);
});

test('ai_query_sends_ruled: each send is recorded with what it held', async () => {
  for (const [what, q] of KINDS) {
    const p = prepareSend(queryAsk(BASE, 'work', CHOICES, q, 'late ones'));
    assert.ok(!('refused' in p), `${what}: ${p.refused}`);
    assert.match(p.body, /graph-data/, 'the graph goes as data');
    const result = await sendPrepared(p, confirmSend(p), { transport: answering(LATE_ANSWER), key: null });
    assert.equal(result.record.outcome, 'answered', what);
    assert.match(result.record.digest, /^[0-9a-f]{64}$/, 'the record keeps what it held by its digest');
    assert.equal(result.record.size > 0, true);
    assert.equal(typeof result.record.scope.things, 'number');
  }
});

test('ai_query_sends_ruled: an answer that fails the untrusted check fills nothing', async () => {
  const hostile = [
    { changes: [{ op: 'remove-thing', thing: 'roof' }] },
    { ...LATE_ANSWER, tests: [{ field: 'secret', op: 'is', value: 'x' }] },
    { ...LATE_ANSWER, tests: [{ field: 'status', op: 'is', value: 'a" or true or "' }] },
    { on: 'links', tests: [{ field: 'weight', op: 'least', value: 2 }] },
  ];
  for (const answer of hostile) {
    const p = prepareSend(queryAsk(BASE, 'work', CHOICES, late, 'late ones'));
    const result = await sendPrepared(p, confirmSend(p), { transport: answering(answer), key: null });
    const after = queryResult(late, 'late ones', result, G, CHOICES);
    assert.ok('failed' in after, JSON.stringify(answer));
    assert.equal(after.query, late, 'the query is as it was');
  }
});
