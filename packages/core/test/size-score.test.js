// How big each thing is (editor spec §68, size_score): size-score.ts. Big items are drawn first far out, and detail
// comes in as you zoom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IMPORTANCE, biggestFirst, sizeScores } from '../src/size-score.ts';

/** A hub `h` linked to four things, a pair `a`–`b`, and a lone `z`. */
const shape = (extra = {}) => ({
  things: ['h', 'p', 'q', 'r', 's', 'a', 'b', 'z'].map((key) => ({ key, text: key, kinds: [], ...(extra[key] ?? {}) })),
  links: [...['p', 'q', 'r', 's'].map((to) => ({ from: 'h', type: 'USES', to })), { from: 'a', type: 'USES', to: 'b' }],
});

// proves: size_score
test('a hub is biggest, a lone thing least, and every size is from 0 to 1', () => {
  const s = sizeScores(shape());
  assert.equal(s.get('h'), 1);
  assert.equal(s.get('z'), 0);
  assert.ok(s.get('a') > 0 && s.get('a') < 1);
  assert.deepEqual(biggestFirst(s).slice(0, 1), ['h']);
  assert.equal(biggestFirst(s).at(-1), 'z');
});

// proves: size_score
test('a larger group counts a little; picked and pinned things are biggest; your importance wins', () => {
  const grouped = sizeScores({ ...shape(), groups: [['team', ['a', 'p', 'q', 'r', 's', 'z']]] });
  assert.ok(grouped.get('z') > 0, 'a lone thing in a big group is not least');
  const asked = sizeScores(shape(), { picked: 'z', pinned: new Set(['b']) });
  assert.equal(asked.get('z'), 1);
  assert.equal(asked.get('b'), 1);
  const own = sizeScores(
    shape({ h: { numbers: new Map([[IMPORTANCE, 0.2]]) }, z: { numbers: new Map([[IMPORTANCE, 7]]) } }),
  );
  assert.equal(own.get('h'), 0.2, 'your say beats its links');
  assert.equal(own.get('z'), 1, 'held to 1');
});
