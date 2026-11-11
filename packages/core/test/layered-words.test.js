// A link between two things of one row has room for its words (editor spec ES§6, same_row_words_room). Our own
// engine keeps such things farther apart than two things no link joins. And a link's words sit clear of its line,
// beside it when it runs up or down, so they are not cramped.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { layered } from '../src/layouts/layered.ts';
import { wordSpots } from '../src/direct-words.ts';
import { curveOf } from '../src/direct-curve.ts';

/** A shape of things by key and links `[from, to]`. */
const shapeOf = (keys, links) => ({
  things: keys.map((key) => ({ key, text: key, kinds: ['Thing'] })),
  links: links.map(([from, to]) => ({ from, type: 'NEEDS', to })),
});
const sizes = new Map(['draft', 'images', 'notes'].map((k) => [k, [100, 40]]));
const beside = { same: [['draft', 'images', 'notes']], before: [] };

describe('a link within one row (same_row_words_room)', () => {
  // proves: same_row_words_room
  test('keeps its two things farther apart than two things no link joins, in either direction', () => {
    for (const [rankdir, across] of [
      ['LR', 1],
      ['TB', 0],
    ]) {
      const joined = layered(shapeOf(['draft', 'images'], [['draft', 'images']]), sizes, rankdir, undefined, {
        nudges: beside,
      }).spots;
      const apart = layered(shapeOf(['draft', 'notes'], []), sizes, rankdir, undefined, { nudges: beside }).spots;
      const gap = (s, a, b) => Math.abs(s.get(a)[across] - s.get(b)[across]);
      assert.equal(joined.get('draft')[1 - across], joined.get('images')[1 - across], `${rankdir}: one row`);
      assert.ok(gap(joined, 'draft', 'images') >= gap(apart, 'draft', 'notes') + 24, `${rankdir}: room for the words`);
    }
  });

  // proves: same_row_words_room
  test('puts the words of an upright link beside its line, and those of a flat link just above it', () => {
    const box = (key, x, y) => ({ key, x, y, hw: 50, hh: 20 });
    const words = { id: 'w', kind: 'label', of: 'e', text: 'needs', x: 0, y: 0, size: 12 };
    const reach = (a, b) => {
      const boxes = new Map([a, b].map((p) => [p.key, p]));
      const [x, y] = wordSpots([words], boxes, new Map([['e', curveOf(a, b, 0)]])).get('w');
      return [Math.abs(x - a.x), Math.abs(y - (a.y + b.y) / 2)];
    };
    const half = (5 * 12 * 0.5) / 2;
    const [across] = reach(box('draft', 0, 0), box('images', 0, 110));
    assert.ok(across >= half, `the words clear the upright line: ${across} off, ${half} half wide`);
    const [, above] = reach(box('idea', 0, 0), box('draft', 200, 0));
    assert.ok(above < half, `the words of a flat line stay close above it: ${above} off`);
  });
});
