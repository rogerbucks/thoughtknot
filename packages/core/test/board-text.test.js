// The board graph kept as text (editor spec §45, board_is_text). A board is its own block in the note, in the same
// notation. Writing a board read from a note gives the same bytes. Moving one item changes one line. So the note stays
// the only store, and every board edit is a change to its text.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { boardOf, moveItem, readBoard, writeBoard } from '../src/board.ts';
import { dataKind } from '../src/blocks.ts';
import { boardBlockIn, boardEditInNote } from '../src/board-edit.ts';

const BOARD = `// graph: ideas · BOARD ON trip
(a:Sticky {x: 10, y: 20, text: 'Go by train'}),
(b:Card {x: 200, y: 20, w: 160, h: 90, text: 'Paris', graph: 'paris'}),
(c:Frame {x: 0, y: 0, w: 400, h: 200, layer: -1, text: 'Travel'}),
(a)-[:CONNECTS {label: 'leads to'}]->(b)`;

describe('the board line', () => {
  test('names the board and the graph it decomposes into', () => {
    assert.deepEqual(boardOf(BOARD), { name: 'ideas', on: 'trip' });
  });

  test('may name no graph: a free board', () => {
    assert.deepEqual(boardOf('// graph: wall · BOARD\n(a:Sticky {x: 0, y: 0})'), { name: 'wall', on: null });
  });

  test('is null for any other block', () => {
    assert.equal(boardOf('// graph: trip\n(a:Place)'), null);
    assert.equal(boardOf('// graph: trip_style · STYLE trip\n(a:Look)'), null);
  });

  test('keeps a board out of the data the drawing draws', () => {
    assert.equal(dataKind(BOARD), null);
    assert.equal(dataKind('// graph: trip\n(a:Place)'), 'data');
  });
});

describe('reading and writing a board', () => {
  test('reads each item with its kind, place, size and text, and each connector', () => {
    const { board, problems } = readBoard(BOARD);
    assert.deepEqual(problems, []);
    assert.equal(board.name, 'ideas');
    assert.equal(board.on, 'trip');
    assert.deepEqual(
      board.items.map((i) => [i.id, i.kind, i.x, i.y, i.text]),
      [
        ['a', 'Sticky', 10, 20, 'Go by train'],
        ['b', 'Card', 200, 20, 'Paris'],
        ['c', 'Frame', 0, 0, 'Travel'],
      ],
    );
    assert.equal(board.items[1].graph, 'paris');
    assert.equal(board.items[2].layer, -1);
    assert.deepEqual(board.connectors, [{ from: 'a', to: 'b', label: 'leads to' }]);
  });

  test('writes a board read from a note back to the same bytes', () => {
    assert.equal(writeBoard(readBoard(BOARD).board), BOARD);
  });

  test('writes properties in one fixed order, whatever order they were given in', () => {
    const text = `// graph: wall · BOARD\n(a:Sticky {text: 'Hi', y: 2, x: 1, colour: 'yellow'})`;
    assert.equal(
      writeBoard(readBoard(text).board),
      `// graph: wall · BOARD\n(a:Sticky {x: 1, y: 2, text: 'Hi', colour: 'yellow'})`,
    );
  });

  test('keeps quotes and backslashes in text safe', () => {
    const text = `// graph: wall · BOARD\n(a:Sticky {x: 0, y: 0, text: 'It\\'s a \\\\ path'})`;
    const { board } = readBoard(text);
    assert.equal(board.items[0].text, "It's a \\ path");
    assert.equal(writeBoard(board), text);
  });
});

describe('an edit to a board', () => {
  test('moving an item changes its one line and nothing else', () => {
    const before = BOARD.split('\n');
    const after = moveItem(BOARD, 'a', 30, 45).split('\n');
    assert.equal(after.length, before.length);
    const changed = after.flatMap((line, i) => (line === before[i] ? [] : [i]));
    assert.deepEqual(changed, [1]);
    assert.equal(after[1], "(a:Sticky {x: 30, y: 45, text: 'Go by train'}),");
  });

  test('rounds a move to whole numbers, so the same board is always the same bytes', () => {
    assert.match(moveItem(BOARD, 'a', 30.4, 44.6), /\(a:Sticky \{x: 30, y: 45,/);
  });

  test('refuses to move an item the board does not hold, leaving the text as it was', () => {
    assert.equal(moveItem(BOARD, 'zz', 1, 1), BOARD);
  });
});

// Each kind of edit is made to a note that holds the board. The note outside the block keeps every byte. The board
// read back from the new text holds the edit.
const EDITED = `// graph: ideas · BOARD ON trip
(a:Sticky {x: 10, y: 20, text: 'Go by train', style: 'accent'}),
(b:Card {x: 200, y: 20, w: 160, h: 90, text: 'Paris', graph: 'paris'}),
(c:Frame {x: 0, y: 0, w: 400, h: 200, layer: -1, text: 'Travel'}),
(a)-[:CONNECTS {label: 'leads to'}]->(b)`;
const BEFORE = '# Trip\n\nSome words before.\n\n```gql\n';
const AFTER = '\n```\n\nAnd words after, kept as they are.\n';
const NOTE = BEFORE + EDITED + AFTER;

const item = (board, id) => board.items.find((i) => i.id === id);

// each kind of edit, and what the board read back from the text must then hold
const EDITS = [
  ['move', { kind: 'move', id: 'a', x: 31, y: 44 }, (b) => [item(b, 'a').x, item(b, 'a').y], [31, 44]],
  ['size', { kind: 'size', id: 'b', w: 220, h: 120 }, (b) => [item(b, 'b').w, item(b, 'b').h], [220, 120]],
  ['text', { kind: 'text', id: 'a', text: "It's a\\ train" }, (b) => item(b, 'a').text, "It's a\\ train"],
  ['style', { kind: 'style', id: 'b', style: 'warning' }, (b) => item(b, 'b').style, 'warning'],
  ['style off', { kind: 'style', id: 'a', style: null }, (b) => item(b, 'a').style, undefined],
  ['layer', { kind: 'layer', id: 'a', layer: 3 }, (b) => item(b, 'a').layer, 3],
  ['lock', { kind: 'lock', id: 'c', locked: true }, (b) => item(b, 'c').locked, true],
  ['group', { kind: 'group', id: 'a', group: 'g1' }, (b) => item(b, 'a').group, 'g1'],
  [
    'add',
    { kind: 'add', item: { id: 'd', kind: 'Text', x: 500, y: 40, text: 'New', more: {} } },
    (b) => [item(b, 'd').kind, item(b, 'd').x, item(b, 'd').text],
    ['Text', 500, 'New'],
  ],
  ['remove', { kind: 'remove', id: 'a' }, (b) => [!!item(b, 'a'), b.connectors.length], [false, 0]],
  ['connect', { kind: 'connect', from: 'b', to: 'c', label: 'in' }, (b) => b.connectors.length, 2],
  ['disconnect', { kind: 'disconnect', from: 'a', to: 'b' }, (b) => b.connectors.length, 0],
];

describe('every board edit is a change to the board block', () => {
  for (const [name, change, read, want] of EDITS)
    test(`a ${name} is written to the note's text, and the board read back holds it`, () => {
      const r = boardEditInNote(NOTE, 'ideas', change);
      assert.ok(!('refused' in r), `the ${name} was refused: ${r.refused}`);
      assert.ok(r.note.startsWith(BEFORE), 'the text before the board is kept');
      assert.ok(r.note.endsWith(AFTER), 'the text after the board is kept');
      assert.equal(boardBlockIn(r.note, 'ideas'), r.text, 'the block given back is the one in the note');
      assert.notEqual(r.text, EDITED, 'the edit changed the text');
      const { board, problems } = readBoard(r.text);
      assert.deepEqual(problems, []);
      assert.deepEqual(read(board), want);
      assert.equal(writeBoard(board), writeBoard(readBoard(writeBoard(board)).board), 'it reads back as itself');
    });
});

describe('the board read back from its text is the same board', () => {
  test('holds each item kind, place, size, text and style', () => {
    const { board } = readBoard(EDITED);
    assert.deepEqual(
      board.items.map((i) => [i.id, i.kind, i.x, i.y, i.w, i.h, i.text, i.style]),
      [
        ['a', 'Sticky', 10, 20, undefined, undefined, 'Go by train', 'accent'],
        ['b', 'Card', 200, 20, 160, 90, 'Paris', undefined],
        ['c', 'Frame', 0, 0, 400, 200, 'Travel', undefined],
      ],
    );
  });

  test('a board written and read again is equal to the board it was', () => {
    const { board } = readBoard(EDITED);
    assert.deepEqual(readBoard(writeBoard(board)).board, board);
  });

  test('a run of edits leaves a note whose board reads as the edits made it, with nothing else changed', () => {
    let note = NOTE;
    for (const [, change] of EDITS.filter(([n]) => !['remove', 'disconnect'].includes(n))) {
      const r = boardEditInNote(note, 'ideas', change);
      assert.ok(!('refused' in r));
      note = r.note;
    }
    assert.ok(note.startsWith(BEFORE) && note.endsWith(AFTER));
    const { board, problems } = readBoard(boardBlockIn(note, 'ideas'));
    assert.deepEqual(problems, []);
    assert.deepEqual(
      board.items.map((i) => i.id),
      ['a', 'b', 'c', 'd'],
    );
    assert.equal(board.connectors.length, 2);
  });

  test('an edit to a board the note no longer holds is refused, and the note is not changed', () => {
    const r = boardEditInNote('# Empty\n', 'ideas', { kind: 'move', id: 'a', x: 1, y: 1 });
    assert.ok('refused' in r);
  });
});
