// The arrangement that fits some chosen things (editor spec ES§45, board_arranged_by_graph). It is worked out from
// their links alone: a grid, a tree, a flow or a cluster. It is the same every time, and each thing gets a place.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fitOf, fittingLayout } from '../src/layouts/arrange-fit.ts';

const shape = (keys, links = []) => ({
  things: keys.map((key) => ({ key, text: key, kinds: [] })),
  links: links.map(([from, to]) => ({ from, type: 'KNOWS', to })),
});

describe('which arrangement fits', () => {
  // proves: board_arranged_by_graph
  test('a link to itself, or one to a thing not chosen, is no link', () => {
    assert.equal(
      fitOf(
        shape(
          ['a', 'b'],
          [
            ['a', 'a'],
            ['a', 'z'],
          ],
        ),
      ),
      'grid',
    );
  });

  test('a chain is a tree, and the same link written twice counts once', () => {
    assert.equal(
      fitOf(
        shape(
          ['a', 'b', 'c'],
          [
            ['a', 'b'],
            ['a', 'b'],
            ['b', 'c'],
          ],
        ),
      ),
      'tree',
    );
  });

  test('a loop through three things is a cluster', () => {
    assert.equal(
      fitOf(
        shape(
          ['a', 'b', 'c'],
          [
            ['a', 'b'],
            ['b', 'c'],
            ['c', 'a'],
          ],
        ),
      ),
      'cluster',
    );
  });
});

describe('the places it gives', () => {
  // proves: board_arranged_by_graph
  test('every thing has a place, and no two things share one', () => {
    for (const s of [
      shape(['a', 'b', 'c', 'd']),
      shape(
        ['a', 'b', 'c', 'd'],
        [
          ['a', 'b'],
          ['a', 'c'],
          ['c', 'd'],
        ],
      ),
      shape(
        ['a', 'b', 'c', 'd'],
        [
          ['a', 'c'],
          ['b', 'c'],
          ['c', 'd'],
        ],
      ),
      shape(
        ['a', 'b', 'c'],
        [
          ['a', 'b'],
          ['b', 'c'],
          ['c', 'a'],
        ],
      ),
    ]) {
      const spots = fittingLayout(s).layout.place(s);
      assert.deepEqual([...spots.keys()].sort(), ['a', 'b', 'c', 'd'].slice(0, s.things.length));
      assert.equal(new Set([...spots.values()].map((p) => p.join())).size, s.things.length, 'no two on one spot');
    }
  });

  test('a grid is as square as it can be, in the order given', () => {
    const s = shape(['a', 'b', 'c', 'd', 'e']);
    const spots = fittingLayout(s).layout.place(s);
    assert.deepEqual(spots.get('a'), [0, 0]);
    assert.deepEqual(spots.get('c'), [2, 0], 'three to a row');
    assert.deepEqual(spots.get('d'), [0, 1]);
  });
});
