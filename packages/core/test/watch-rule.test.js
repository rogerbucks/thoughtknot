// Watching a rule (editor spec §60, discover_watch_rule): one notice when a watched rule starts or stops matching.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { look, watching } from '../src/watch-rule.ts';

const RULE = "MATCH (p:Task) RETURN p.id AS id, CASE WHEN p.status = 'open' THEN 'open' ELSE 'other' END AS grp";
const graph = (a, b) =>
  new gs.Graph(
    new Map([
      ['a', [new Set(['Task']), { status: a }]],
      ['b', [new Set(['Task']), { status: b }]],
    ]),
    [],
  );

test('a watched rule that starts matching after an edit gives one notice', () => {
  // proves: discover_watch_rule
  const first = look(watching(RULE, 'open'), graph('done', 'done'));
  assert.equal(first.notice, null, 'the first look is the baseline');
  const edited = look(first.watch, graph('open', 'done'));
  assert.match(edited.notice, /now matches a/);
  assert.equal(look(edited.watch, graph('open', 'done')).notice, null, 'no change, no notice');
  const stopped = look(edited.watch, graph('done', 'done'));
  assert.match(stopped.notice, /no longer matches a/);
});
