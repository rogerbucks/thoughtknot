// Where was I? after a break (editor spec ES§74, since_you_left). The view is built from the focus trail and each
// note's own last change, offered only after a break unless asked for.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BREAK_MINUTES, awaySaid, placeSaid, sinceYouLeft, staleHead } from '../src/since-you-left.ts';
import { visitsFrom } from '../src/recent.ts';

const NOW = new Date('2026-11-12T12:00:00Z');
const ago = (minutes) => new Date(NOW.getTime() - minutes * 60_000);
const trail = [
  { path: 'Plan.md', graph: 'plan', thing: 'login', at: ago(120).toISOString() },
  { path: 'Ideas.md', graph: 'ideas', at: ago(180).toISOString() },
];
const notes = [
  { path: 'Plan.md', changed: ago(200).getTime() },
  { path: 'Budget.md', changed: ago(60).getTime() },
  { path: 'Ideas.md', changed: ago(30).getTime() },
];

describe('where was I? (since_you_left)', () => {
  test('after a break: the places, newest first, and each note changed since, newest first', () => {
    const view = sinceYouLeft(trail, notes, NOW);
    assert.equal(view.away, 120);
    assert.deepEqual(
      view.places.map((p) => p.path),
      ['Plan.md', 'Ideas.md'],
    );
    assert.deepEqual(
      view.changes.map((c) => c.path),
      ['Ideas.md', 'Budget.md'],
    );
  });

  test('before a break it is not offered, but asked for it is', () => {
    const soon = [{ ...trail[0], at: ago(BREAK_MINUTES - 1).toISOString() }];
    assert.equal(sinceYouLeft(soon, notes, NOW), null);
    assert.equal(sinceYouLeft(soon, notes, NOW, true).away, BREAK_MINUTES - 1);
    assert.equal(sinceYouLeft([], notes, NOW, true), null, 'no trail, no place to go back to');
    assert.equal(sinceYouLeft([{ path: 'a.md', graph: 'a' }], notes, NOW, true), null, 'a trail with no time');
  });

  test('the trail keeps the time of each visit, and the head takes a new one only after a while', () => {
    const [kept] = visitsFrom([{ ...trail[0] }, { path: 'x.md', graph: 'x', at: 'not a time' }]);
    assert.equal(kept.at, trail[0].at);
    assert.equal(visitsFrom([{ path: 'x.md', graph: 'x', at: 'no' }])[0].at, undefined);
    assert.equal(staleHead({ ...trail[0], at: ago(1).toISOString() }, NOW), false);
    assert.equal(staleHead({ ...trail[0], at: ago(10).toISOString() }, NOW), true);
    assert.equal(staleHead(undefined, NOW), true);
  });

  test('how long away and each place, in words', () => {
    assert.equal(awaySaid(1), 'You were last here 1 minute ago.');
    assert.equal(awaySaid(150), 'You were last here 2 hours ago.');
    assert.equal(awaySaid(60 * 72), 'You were last here 3 days ago.');
    assert.equal(placeSaid(trail[0]), 'login in plan, in Plan.md');
    assert.equal(placeSaid(trail[1]), 'ideas, in Ideas.md');
  });
});
