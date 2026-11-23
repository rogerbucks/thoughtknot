// A saved query opened again, or asked again (editor spec ES§75, ai_query_replay): filter-replay.ts.
// - It keeps every prompt in order and the rule it ended at.
// - Reopened, it runs that rule on the graph as it is now, with nothing sent.
// - Ask again sends the prompts in order, against today's graph, only after the person says yes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmSend, prepareSend, sendPrepared } from '../src/ai.ts';
import { gqlBlocks } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { queriesMerged, queryAnswered, queryKeeps, queryLocked, queryOf } from '../src/filter.ts';
import { savedQueryFrom } from '../src/filter-manage.ts';
import { savedQueryWritten } from '../src/filter-manage-note.ts';
import { askAgainSaid, askedAgain, askerOf, savedQueryOpened } from '../src/filter-replay.ts';
import { readStyle } from '../src/style.ts';
import { BASE, CHOICES, DEAR, G, LATE, LATE_ANSWER, NOTE, answering } from './filter-query-fixtures.js';

const texts = (note) => gqlBlocks(note).map((b) => b.text);
const savedOf = (q, name = 'Saved') => {
  const r = savedQueryWritten(NOTE, 'work', savedQueryFrom(name, q));
  assert.ok('note' in r, r.refused);
  return readStyle(texts(r.note), 'work', readNote(texts(r.note))).style.queries[0];
};
const DEAR_ANSWER = { on: 'things', of: 'Task', tests: [{ field: 'cost', op: 'more', value: 40 }], badge: 'star' };
/** Late tasks refined to the dear ones: two prompts. */
const refined = () => {
  const next = queryAnswered(queryOf('q1', 'late tasks', LATE), 'only the dear ones', {
    kind: 'Task',
    when: 'status == "late" and cost > 40',
    means: 'Dear and late',
  });
  assert.ok(!('refused' in next));
  return next;
};
/** A send through the one way anything is sent, answering each in turn from `answers`, keeping what went. */
const sender = (answers, sent) => {
  let n = 0;
  return async (ask) => {
    const p = prepareSend(ask);
    assert.ok(!('refused' in p), p.refused);
    return sendPrepared(p, confirmSend(p), { transport: answering(answers[n++] ?? LATE_ANSWER, sent), key: null });
  };
};
const deps = ({ send, ...extra }) => ({
  now: G,
  choices: CHOICES,
  ask: askerOf(BASE, 'work', CHOICES, send),
  ...extra,
});

test('ai_query_replay: a saved query keeps every prompt in order and the rule it ended at', () => {
  const s = savedOf(refined());
  assert.deepEqual(s.words, ['late tasks', 'only the dear ones']);
  assert.deepEqual(s.draft.tests, [
    { field: 'status', op: 'is', value: 'late' },
    { field: 'cost', op: 'more', value: '40' },
  ]);
});

test('ai_query_replay: reopened, it runs its rule on the graph as it is now, with nothing sent', () => {
  const s = savedOf(queryOf('q1', 'late tasks', LATE));
  const opened = savedQueryOpened(s, 'q9', CHOICES);
  assert.ok('query' in opened);
  assert.deepEqual([...queryKeeps(G, opened.query)].sort(), ['floor', 'roof']);
  const today = readNote([texts(NOTE)[0].replace("status: 'done'", "status: 'late'")]).world.work;
  assert.deepEqual([...queryKeeps(today, opened.query)].sort(), ['floor', 'roof', 'walls'], 'the graph as it is now');
  assert.equal(opened.stale, null);
});

test('ai_query_replay: reopened and saved again, it keeps all its prompts', () => {
  const opened = savedQueryOpened(savedOf(refined()), 'q9', CHOICES);
  assert.ok('query' in opened);
  assert.deepEqual(savedQueryFrom('Again', opened.query).words, ['late tasks', 'only the dear ones']);
});

test('ai_query_replay: Ask again shows the prompts in order first, and a no sends nothing', async () => {
  const s = savedOf(refined());
  const said = askAgainSaid(s);
  assert.ok(said.indexOf('1. late tasks') < said.indexOf('2. only the dear ones'), said);
  const sent = [];
  const shown = [];
  const out = await askedAgain(s, 'q9', deps({ confirm: (w) => (shown.push(w), false), send: sender([], sent) }));
  assert.ok('declined' in out);
  assert.deepEqual(shown, [said]);
  assert.equal(sent.length, 0, 'nothing was sent');
});

test('ai_query_replay: after a yes, Ask again sends each prompt in order against today’s graph', async () => {
  const sent = [];
  const send = sender([LATE_ANSWER, { ...DEAR_ANSWER, tests: [...LATE_ANSWER.tests, ...DEAR_ANSWER.tests] }], sent);
  const out = await askedAgain(savedOf(refined()), 'q9', deps({ confirm: () => true, send }));
  assert.ok('query' in out, out.failed);
  assert.equal(sent.length, 2);
  const bodies = sent.map((r) => r.body);
  assert.match(bodies[0], /late tasks/);
  assert.doesNotMatch(bodies[0], /only the dear ones/);
  assert.match(bodies[1], /only the dear ones/);
  assert.deepEqual([...queryKeeps(G, out.query)], ['roof']);
});

test('ai_query_replay: a merged query asks each part again in turn, each keeping its mark', async () => {
  const merged = queriesMerged('m1', [queryOf('q1', 'late tasks', LATE), queryOf('q2', 'dear tasks', DEAR)], 'any');
  const sent = [];
  const out = await askedAgain(
    savedOf(merged),
    'q9',
    deps({ confirm: () => true, send: sender([LATE_ANSWER, DEAR_ANSWER], sent) }),
  );
  assert.ok('query' in out, out.failed);
  assert.equal(sent.length, 2);
  assert.deepEqual(
    out.query.parts.map((p) => p.mark),
    merged.parts.map((p) => p.mark),
  );
  assert.deepEqual([...queryKeeps(G, out.query)].sort(), ['floor', 'roof', 'walls']);
});

test('ai_query_replay: a locked query is not asked again, and nothing is sent', async () => {
  const sent = [];
  let asked = false;
  const s = savedOf(queryLocked(queryOf('q1', 'late tasks', LATE), true));
  const out = await askedAgain(s, 'q9', deps({ confirm: () => (asked = true), send: sender([], sent) }));
  assert.ok('failed' in out);
  assert.equal(asked, false);
  assert.equal(sent.length, 0);
});
