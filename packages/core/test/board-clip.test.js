// Copy, paste and duplicate on a board (editor spec ES§45, board_handles). What is copied comes back with new names, in
// the same places among each other, with the connectors between them, as one change. Nothing on the board moves.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { boardEdit } from '../src/board-edit.ts';
import { itemBox } from '../src/board-svg.ts';
import { copyItems, duplicateItems, pasteClip } from '../src/board-clip.ts';

const TEXT = `// graph: ideas · BOARD ON trip
(a:Sticky {x: 0, y: 0, text: 'Go by train', graph: 'train', group: 'g', locked: true, votes: 'ann:+1'}),
(b:Card {x: 300, y: 0, w: 200, h: 100, text: 'Paris', group: 'g'}),
(c:Sticky {x: 0, y: 400, text: 'Hotel'}),
(a)-[:CONNECTS {label: 'to'}]->(b),
(b)-[:CONNECTS]->(c)`;
const BOARD = readBoard(TEXT).board;

describe('copying board items', () => {
  // proves: board_handles
  test('takes the items and only the connectors between two of them', () => {
    const clip = copyItems(BOARD, ['a', 'b']);
    assert.deepEqual(
      clip.items.map((i) => i.id),
      ['a', 'b'],
    );
    assert.deepEqual(clip.connectors, [{ from: 'a', to: 'b', label: 'to' }]);
    assert.equal(copyItems(BOARD, ['gone']), null);
  });

  // proves: board_handles
  test('pastes them with new names, their places kept among each other, round the spot asked for', () => {
    const { change, ids } = pasteClip(BOARD, copyItems(BOARD, ['a', 'b']), [1000, 1000]);
    assert.equal(change.kind, 'adds');
    assert.deepEqual(ids, ['sticky1', 'card1']);
    const [a, b] = change.items;
    assert.equal(b.x - a.x, 300, 'the same places among each other');
    const left = itemBox(a).x,
      right = itemBox(b).x + itemBox(b).w;
    assert.equal(Math.round((left + right) / 2), 1000);
    assert.deepEqual(change.connectors, [{ from: 'sticky1', to: 'card1', label: 'to' }]);
  });

  // proves: board_handles
  test('leaves what belonged to the first items: the thing linked, the lock, the votes; a group is a new one', () => {
    const [a, b] = pasteClip(BOARD, copyItems(BOARD, ['a', 'b']), [0, 0]).change.items;
    assert.equal(a.graph, undefined);
    assert.equal(a.locked, undefined);
    assert.deepEqual(a.more, {});
    assert.equal(a.text, 'Go by train');
    assert.equal(a.group, b.group, 'still together');
    assert.notEqual(a.group, 'g', 'apart from the items copied');
  });

  // proves: board_handles
  test('is one change to the block, and every item already there stays as written', () => {
    const { change } = pasteClip(BOARD, copyItems(BOARD, ['a', 'b']), [2000, 0]);
    const r = boardEdit(TEXT, change);
    const after = readBoard(r.text).board;
    assert.equal(after.items.length, 5);
    assert.equal(after.connectors.length, 3);
    for (const was of BOARD.items) {
      const now = after.items.find((i) => i.id === was.id);
      assert.deepEqual([now.x, now.y], [was.x, was.y], `${was.id} stays put`);
    }
  });

  // proves: board_handles
  test('duplicates just to the right, never over what it copies', () => {
    const { change, ids } = duplicateItems(BOARD, ['c']);
    assert.deepEqual(ids, ['sticky1']);
    const copy = itemBox(change.items[0]),
      first = itemBox(BOARD.items[2]);
    assert.ok(copy.x >= first.x + first.w, 'to the right');
    assert.equal(copy.y, first.y, 'on the same line');
    assert.equal(duplicateItems(BOARD, []), null);
  });

  // proves: board_handles
  test('a paste is refused, changing nothing, when a name it would make is taken', () => {
    const r = boardEdit(TEXT, { kind: 'adds', items: [{ ...BOARD.items[2], id: 'a' }], connectors: [] });
    assert.ok('refused' in r);
  });
});
