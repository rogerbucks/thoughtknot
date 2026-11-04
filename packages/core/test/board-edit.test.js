// Editing a board by its text (editor spec §45, board_is_text, board_keyboard). A move, a size or new text changes
// that item's own text alone. An item made, taken out or joined writes the board in its fixed form, and never over a
// problem. A locked item stays as it is. A new item goes in free room, and no other item moves.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { boardEdit, boardEditInNote, freeId, newItem, MIN_SIDE } from '../src/board-edit.ts';

const BOARD = `// graph: ideas · BOARD
// the first idea
(a:Sticky {x: 10, y: 20, text: 'Go by train'}),
(b:Card {x: 300, y: 20, w: 160, h: 90, text: 'Paris'}),
(k:Sticky {x: 10, y: 400, text: 'Fixed', locked: true}),
(a)-[:CONNECTS]->(b)`;

const edited = (change) => {
  const r = boardEdit(BOARD, change);
  assert.ok('text' in r, r.refused);
  return r.text;
};

describe('one item changed', () => {
  test('a move changes that item’s line alone, comments kept', () => {
    const after = edited({ kind: 'move', id: 'a', x: 40.4, y: 59.6 });
    assert.match(after, /\/\/ the first idea/);
    assert.match(after, /\(a:Sticky \{x: 40, y: 60, text: 'Go by train'\}\)/);
    assert.equal(after.split('\n').filter((l, i) => l !== BOARD.split('\n')[i]).length, 1);
  });

  test('a size is written whole, never below the smallest side', () => {
    const after = edited({ kind: 'size', id: 'b', w: 5, h: 120 });
    assert.match(after, new RegExp(`\\(b:Card \\{x: 300, y: 20, w: ${MIN_SIDE}, h: 120`));
  });

  test('new text is written quoted', () => {
    assert.match(edited({ kind: 'text', id: 'a', text: "Go by 'boat'" }), /text: 'Go by \\'boat\\''/);
  });

  test('a locked item is never moved, sized or taken out, but its text may change', () => {
    for (const change of [
      { kind: 'move', id: 'k', x: 0, y: 0 },
      { kind: 'size', id: 'k', w: 90, h: 90 },
      { kind: 'remove', id: 'k' },
    ])
      assert.match(boardEdit(BOARD, change).refused, /locked/);
    assert.ok('text' in boardEdit(BOARD, { kind: 'text', id: 'k', text: 'Still fixed' }));
  });

  test('an item not on the board is refused', () => {
    assert.match(boardEdit(BOARD, { kind: 'move', id: 'zz', x: 0, y: 0 }).refused, /zz/);
  });
});

describe('the board’s shape changed', () => {
  test('an item made is written, and read back as made', () => {
    const { board } = readBoard(BOARD);
    const item = newItem(board, 'Sticky', board.items[0], [0, 0]);
    const after = edited({ kind: 'add', item });
    assert.deepEqual(
      readBoard(after).board.items.find((i) => i.id === item.id),
      item,
    );
  });

  test('an item taken out takes its connectors with it', () => {
    const after = readBoard(edited({ kind: 'remove', id: 'b' })).board;
    assert.deepEqual(
      after.items.map((i) => i.id),
      ['a', 'k'],
    );
    assert.deepEqual(after.connectors, []);
  });

  test('two items are joined once, and an item never to itself', () => {
    const after = readBoard(edited({ kind: 'connect', from: 'b', to: 'k', label: 'then' })).board;
    assert.deepEqual(after.connectors.at(-1), { from: 'b', to: 'k', label: 'then' });
    assert.match(boardEdit(BOARD, { kind: 'connect', from: 'a', to: 'b' }).refused, /already/);
    assert.match(boardEdit(BOARD, { kind: 'connect', from: 'a', to: 'a' }).refused, /two different/);
  });

  test('is refused while the block holds a problem, so nothing unread is lost', () => {
    const broken = `${BOARD},\n(z:Balloon {x: 0, y: 0})`;
    assert.match(boardEdit(broken, { kind: 'remove', id: 'a' }).refused, /problems/);
  });
});

describe('a new item', () => {
  const { board } = readBoard(BOARD);

  test('takes a name the board does not use', () => {
    assert.equal(freeId(board, 'Sticky'), 'sticky1');
    const more = { ...board, items: [...board.items, { id: 'sticky1', kind: 'Sticky', x: 0, y: 0, more: {} }] };
    assert.equal(freeId(more, 'Sticky'), 'sticky2');
  });

  test('goes just right of the item in focus, in free room, and no other item moves', () => {
    const a = board.items[0];
    const item = newItem(board, 'Sticky', a, [0, 0]);
    assert.ok(item.x > a.x + 100, 'right of it');
    const box = (i) => [i.x, i.y, i.w ?? 160, i.h ?? 160];
    for (const other of board.items) {
      const [x, y, w, h] = box(other),
        [nx, ny, nw, nh] = box(item);
      assert.ok(!(nx < x + w && x < nx + nw && ny < y + h && y < ny + nh), `clear of ${other.id}`);
    }
    assert.deepEqual(readBoard(BOARD).board.items, board.items);
  });

  test('with nothing in focus, is centred where it is asked for', () => {
    const item = newItem({ ...board, items: [] }, 'Sticky', null, [1000, 1000]);
    assert.deepEqual([item.x, item.y], [920, 920]);
  });
});

describe('a board edited in its note', () => {
  const NOTE = `# Ideas\n\n\`\`\`gql\n${BOARD}\n\`\`\`\n\nAfter.\n`;

  test('changes the board block alone, every other byte kept', () => {
    const r = boardEditInNote(NOTE, 'ideas', { kind: 'move', id: 'a', x: 0, y: 0 });
    assert.ok(r.note.startsWith('# Ideas\n\n```gql\n'));
    assert.ok(r.note.endsWith('```\n\nAfter.\n'));
    assert.match(r.text, /\(a:Sticky \{x: 0, y: 0,/);
    assert.ok(r.note.includes(r.text));
  });

  test('is refused when the note no longer holds the board', () => {
    assert.match(boardEditInNote('# Empty\n', 'ideas', { kind: 'remove', id: 'a' }).refused, /ideas/);
  });
});
