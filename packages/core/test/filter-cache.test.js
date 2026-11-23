// The answers kept for queries (editor spec ES§75, ai_query_cache): filter-cache.ts.
// - The same words, rule being refined and note shape reuse the kept answer, with nothing sent.
// - The key holds no note content: only the words, the rule, and the note's kinds and property names.
// - Each vault has its own cache, and clearing one empties it alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmSend, prepareSend, sendPrepared } from '../src/ai.ts';
import { readNote } from '../src/drawing.ts';
import { queryOf } from '../src/filter.ts';
import { queryAnswerFor, queryCache, queryCacheKey } from '../src/filter-cache.ts';
import { queryAsk, queryResult } from '../src/filter-send.ts';
import { ruleChoices } from '../src/rule-builder.ts';
import { BASE, CHOICES, G, GRAPH, LATE, LATE_ANSWER, LATE_RULE, answering } from './filter-query-fixtures.js';

/** A device store held in memory, as local storage holds it. */
const device = () => {
  const m = new Map();
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
    keys: () => [...m.keys()],
    m,
  };
};
/** A rule as an answer gives it: its test, its look and its name. */
const KEPT = { ...LATE_RULE, badge: 'clock', colour: 'blue' };
const choicesOf = (text) => ruleChoices(readNote([text]).world.work);

test('ai_query_cache: the same words, rule and note shape reuse the kept answer, with nothing sent', async () => {
  const cache = queryCache(device(), 'Vault');
  const sent = [];
  const send = async () => {
    const p = prepareSend(queryAsk(BASE, 'work', CHOICES, null, 'late tasks'));
    return sendPrepared(p, confirmSend(p), { transport: answering(LATE_ANSWER, sent), key: null });
  };
  const key = queryCacheKey('late tasks', null, CHOICES);
  const first = await queryAnswerFor(cache, key, send);
  assert.equal(first.sent, true);
  const again = await queryAnswerFor(cache, queryCacheKey('  late   tasks ', null, CHOICES), send);
  assert.equal(again.sent, false, 'reused');
  assert.equal(sent.length, 1, 'nothing more was sent');
  const asked = queryResult(null, 'late tasks', again.result, G, CHOICES, 'q1');
  assert.ok('query' in asked, asked.failed);
  assert.deepEqual([...asked.query.draft.tests], LATE.tests);
});

test('ai_query_cache: the key is the words, the rule refined and the shape, never the note’s content', () => {
  const key = queryCacheKey('late tasks', queryOf('q1', 'late', LATE), CHOICES);
  for (const content of ['Roof', 'Walls', 'Sam', 'done', '80', '60']) assert.ok(!key.includes(content), content);
  for (const shape of ['Task', 'Person', 'status', 'cost', 'OWNS']) assert.ok(key.includes(shape), shape);
  const other = choicesOf(GRAPH.replace("'Roof'", "'Attic'").replace('cost: 80', 'cost: 99'));
  assert.equal(
    queryCacheKey('late tasks', null, other),
    queryCacheKey('late tasks', null, CHOICES),
    'values: same key',
  );
  const renamed = choicesOf(GRAPH.replaceAll('cost:', 'price:'));
  assert.notEqual(queryCacheKey('late tasks', null, renamed), queryCacheKey('late tasks', null, CHOICES));
  assert.notEqual(
    queryCacheKey('late tasks', queryOf('q1', 'late', LATE), CHOICES),
    queryCacheKey('late tasks', null, CHOICES),
  );
});

test('ai_query_cache: each vault has its own cache, and clearing one empties it alone', () => {
  const store = device();
  const mine = queryCache(store, 'Mine');
  const theirs = queryCache(store, 'Theirs');
  const key = queryCacheKey('late tasks', null, CHOICES);
  mine.keep(key, KEPT);
  assert.deepEqual(mine.answer(key), KEPT);
  assert.equal(theirs.answer(key), null, 'not in another vault');
  theirs.keep(key, KEPT);
  assert.equal(mine.clear(), 1);
  assert.equal(mine.answer(key), null, 'cleared');
  assert.deepEqual(theirs.answer(key), KEPT, 'the other vault kept its answer');
});

test('ai_query_cache: a kept answer is read again as untrusted, and one that is no filter is not reused', () => {
  const store = device();
  const cache = queryCache(store, 'Vault');
  const key = queryCacheKey('late tasks', null, CHOICES);
  cache.keep(key, { ...KEPT, when: 'status == "late" or 1' });
  assert.equal(cache.answer(key), null);
  for (const k of store.keys()) store.set(k, 'not json');
  assert.equal(cache.answer(key), null);
});

test('ai_query_cache: a store that throws, full or turned off, never stops an ask', () => {
  const broken = {
    get: () => {
      throw new Error('blocked');
    },
    set: () => {
      throw new Error('full');
    },
    remove: () => {
      throw new Error('blocked');
    },
    keys: () => {
      throw new Error('blocked');
    },
  };
  const cache = queryCache(broken, 'vault');
  const key = queryCacheKey('late tasks', null, CHOICES);
  assert.doesNotThrow(() => cache.keep(key, KEPT));
  assert.equal(cache.answer(key), null);
  assert.equal(cache.clear(), 0);
});
