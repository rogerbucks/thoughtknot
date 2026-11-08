// board_cluster (editor spec §45): notes that share a tag or a word are grouped into frames on the device, and no note
// moves.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { boardEdit } from '../src/board-edit.ts';
import { clusters, clusterPlan } from '../src/board-cluster.ts';
import { itemBox } from '../src/board-svg.ts';

const BOARD = `// graph: ideas · BOARD
(a:Sticky {x: 0, y: 0, text: 'Budget for travel #money'}),
(b:Sticky {x: 200, y: 0, text: 'Hotel costs #money'}),
(c:Sticky {x: 0, y: 400, text: 'Plan the launch event'}),
(d:Sticky {x: 200, y: 400, text: 'Launch invitations'}),
(e:Sticky {x: 1000, y: 0, text: 'Unrelated thought'})`;

const board = () => readBoard(BOARD).board;
const apply = (changes) => changes.reduce((t, c) => boardEdit(t, c).text, BOARD);

describe('board_cluster', () => {
  test('notes sharing a tag or a word form a group; a lone note forms none', () => {
    const found = clusters(board());
    assert.equal(found.length, 2);
    assert.deepEqual(
      found.map((c) => c.ids.sort()),
      [
        ['a', 'b'],
        ['c', 'd'],
      ],
    );
    assert.ok(!found.some((c) => c.ids.includes('e')));
  });

  test('a group is named by the tag or word its notes share most', () => {
    const labels = clusters(board())
      .map((c) => c.label)
      .sort();
    assert.deepEqual(labels, ['#money', 'launch']);
  });

  test('each group gets a frame round its notes, and no note moves', () => {
    const plan = clusterPlan(board());
    assert.equal(plan.framed.length, 2);
    const after = readBoard(apply(plan.changes)).board;
    assert.equal(after.items.filter((i) => i.kind === 'Frame').length, 2);
    for (const was of board().items) {
      const now = after.items.find((i) => i.id === was.id);
      assert.deepEqual([now.x, now.y], [was.x, was.y]);
    }
    const frame = after.items.find((i) => i.kind === 'Frame' && i.text === '#money');
    const f = itemBox(frame);
    for (const id of ['a', 'b']) {
      const b = itemBox(after.items.find((i) => i.id === id));
      assert.ok(b.x >= f.x && b.y >= f.y && b.x + b.w <= f.x + f.w && b.y + b.h <= f.y + f.h);
    }
  });

  test('a group is left as it is when another note sits in its frame', () => {
    const text = BOARD.replace("x: 1000, y: 0, text: 'Unrelated thought'", "x: 100, y: 10, text: 'Unrelated thought'");
    const plan = clusterPlan(readBoard(text).board);
    assert.equal(plan.left.length, 1);
    assert.equal(plan.framed.length, 1);
  });

  test('grouping twice adds no second frame', () => {
    const once = apply(clusterPlan(board()).changes);
    assert.equal(clusterPlan(readBoard(once).board).changes.length, 0);
  });

  test('it is worked out with no network call and said in words', () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => assert.fail('no network call');
    try {
      assert.match(clusterPlan(board()).said, /2 frames/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
