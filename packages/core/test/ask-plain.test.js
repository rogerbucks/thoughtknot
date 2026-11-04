// Asking in plain words (editor spec §60, discover_ask_plain).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { askPlain, runAsk } from '../src/ask-plain.ts';

const T = (status) => [new Set(['Task']), { status }];
const G = new gs.Graph(
  new Map([
    ['a', T('open')],
    ['b', T('done')],
    ['c', T('open')],
  ]),
  [],
);

test('a plain question becomes a checked read-only query, shown with its count before it runs, and a write is refused', () => {
  // proves: discover_ask_plain
  const ok = askPlain(
    'what is open?',
    () => ({ graph: 'g', match: 'Task', where: [{ key: 'status', op: '=', value: 'open' }], limit: 10 }),
    G,
  );
  assert.ok(ok.ok);
  assert.equal(ok.preview.count, 2, 'the count is known before anything runs');
  assert.deepEqual(runAsk(ok.preview, G), ['a', 'c']);
  const write = askPlain('delete all', () => ({ graph: 'g', match: 'Task', where: [], limit: 5, delete: true }), G);
  assert.deepEqual(write, { ok: false, fault: 'unknown-field' });
  assert.equal(askPlain('x', () => 'drop table', G).ok, false, 'a reply that is not a query is refused');
});
