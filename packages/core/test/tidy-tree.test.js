// The tidy tree of our own engine (editor spec §68: layout_tidy_tree). Its file is layouts/tidy-tree.ts. A tree is
// drawn as one. Each thing sits a row after its parent, at the middle of its children. No two links cross.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { childrenOf, tidyTree } from '../src/layouts/tidy-tree.ts';
import { ownSpots } from '../src/layouts/own-engine.ts';

const shapeOf = (links, keys = [...new Set(links.flat())]) => ({
  things: keys.map((key) => ({ key, text: key, kinds: [] })),
  links: links.map(([from, to]) => ({ from, type: '', to })),
});
const box = (of) => ({ kind: 'box', id: of, style: 'thing', role: 'thing', of, x: 0, y: 0, width: 120, height: 40 });
const link = ([from, to]) => ({ kind: 'link', id: `${from} ${to}`, style: 'link', from, to, points: [] });
const TREE = [
  ['r', 'a'],
  ['r', 'b'],
  ['a', 'a1'],
  ['a', 'a2'],
  ['a', 'a3'],
  ['b', 'b1'],
];

describe('a tidy tree', () => {
  // proves: layout_tidy_tree
  test('puts each thing a row after its parent, each parent at the middle of its children, its children in order', () => {
    const { spots } = tidyTree(shapeOf(TREE), new Map(), 'TB');
    const [x, y] = [(k) => spots.get(k)[0], (k) => spots.get(k)[1]];
    for (const [parent, child] of TREE) assert.ok(y(child) > y(parent), `${child} below ${parent}`);
    assert.equal(x('a'), (x('a1') + x('a3')) / 2);
    assert.equal(x('r'), (x('a') + x('b')) / 2);
    assert.equal(x('b'), x('b1'));
    assert.ok(x('a1') < x('a2') && x('a2') < x('a3') && x('a3') < x('b1'), 'in the order written, no link crossing');
    assert.ok(x('b1') - x('a3') >= 120, 'no two boxes on each other');
  });

  // proves: layout_tidy_tree
  test('is how our engine draws a part that is a tree, and only that', () => {
    const laid = {
      marks: [...shapeOf(TREE).things.map((t) => box(t.key)), ...TREE.map(link)],
      space: { width: 0, height: 0 },
    };
    const { spots } = ownSpots(laid, 'TB');
    assert.ok(Math.abs(spots.get('r')[0] - (spots.get('a')[0] + spots.get('b')[0]) / 2) < 1e-6);
    assert.equal(childrenOf(shapeOf([...TREE, ['b', 'a2']])), undefined, 'a thing with two parents');
    assert.equal(
      childrenOf(
        shapeOf([
          ['p', 'q'],
          ['q', 'p'],
        ]),
      ),
      undefined,
      'a loop',
    );
    assert.equal(
      tidyTree(
        shapeOf([
          ['p', 'q'],
          ['q', 'p'],
        ]),
      ),
      undefined,
    );
  });
});
