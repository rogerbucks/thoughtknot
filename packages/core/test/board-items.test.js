// board_items (editor spec §45): each item kind is made, sized, moved, grouped, layered, locked and styled, and
// written to the board block.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_KINDS, readBoard } from '../src/board.ts';
import { boardEdit, layerFor, newItem } from '../src/board-edit.ts';

const BOARD = `// graph: ideas · BOARD
(a:Sticky {x: 10, y: 20, text: 'One'}),
(b:Card {x: 300, y: 20, text: 'Two', layer: 3}),
(k:Sticky {x: 10, y: 400, locked: true})`;

const edited = (text, change) => {
  const r = boardEdit(text, change);
  assert.ok('text' in r, r.refused);
  return r.text;
};
const itemOf = (text, id) => readBoard(text).board.items.find((i) => i.id === id);

describe('board_items', () => {
  test('every kind is made and written to the block', () => {
    let text = BOARD;
    for (const kind of BOARD_KINDS) {
      const board = readBoard(text).board;
      const item = newItem(board, kind, null, [800, 800]);
      text = edited(text, { kind: 'add', item });
      assert.equal(itemOf(text, item.id)?.kind, kind);
    }
    assert.equal(readBoard(text).problems.length, 0);
  });

  test('a layer, a style and a group are set and written, then taken off', () => {
    let text = edited(BOARD, { kind: 'layer', id: 'a', layer: 5.4 });
    text = edited(text, { kind: 'style', id: 'a', style: 'accent' });
    text = edited(text, { kind: 'group', id: 'a', group: 'trip' });
    assert.deepEqual(
      [itemOf(text, 'a').layer, itemOf(text, 'a').style, itemOf(text, 'a').group],
      [5, 'accent', 'trip'],
    );
    text = edited(text, { kind: 'style', id: 'a', style: null });
    text = edited(text, { kind: 'group', id: 'a', group: null });
    assert.equal(itemOf(text, 'a').style, undefined);
    assert.equal(itemOf(text, 'a').group, undefined);
  });

  test('a lock is set, refuses every other change but text, and can be lifted', () => {
    const locked = edited(BOARD, { kind: 'lock', id: 'a', locked: true });
    assert.equal(itemOf(locked, 'a').locked, true);
    for (const change of [
      { kind: 'move', id: 'a', x: 1, y: 1 },
      { kind: 'layer', id: 'a', layer: 1 },
      { kind: 'style', id: 'a', style: 'accent' },
      { kind: 'group', id: 'a', group: 'g' },
    ])
      assert.ok('refused' in boardEdit(locked, change), change.kind);
    assert.ok('text' in boardEdit(locked, { kind: 'text', id: 'a', text: 'ok' }));
    assert.equal(itemOf(edited(locked, { kind: 'lock', id: 'a', locked: false }), 'a').locked, undefined);
  });

  test('front and back find a layer over or under every other item', () => {
    const board = readBoard(BOARD).board;
    assert.equal(layerFor(board, 'a', 'front'), 4);
    assert.equal(layerFor(board, 'a', 'back'), -1);
  });

  test('a change to one item changes that item’s line alone', () => {
    const after = edited(BOARD, { kind: 'layer', id: 'a', layer: 2 });
    assert.equal(after.split('\n').filter((l, i) => l !== BOARD.split('\n')[i]).length, 1);
  });
});
