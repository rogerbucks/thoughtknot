// A board for keyboard and screen-reader users (editor spec §45, board_keyboard). Every item is announced with its
// kind, its text and what it joins. The outline lists the whole board as text, with what a frame holds under it, so
// the board can be read without seeing it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../packages/core/src/board.ts';
import { boardOutline, boardSvg, itemSaid } from '../packages/core/src/board-svg.ts';
import { PALETTES } from '../packages/core/src/palette.ts';

const BOARD = readBoard(`// graph: ideas · BOARD
(c:Frame {x: 0, y: 0, w: 600, h: 300, text: 'Travel'}),
(a:Sticky {x: 10, y: 20, text: 'Go by train'}),
(b:Card {x: 300, y: 20, w: 160, h: 90, text: 'Paris'}),
(e:Sticky {x: 900, y: 20, text: 'Budget'}),
(a)-[:CONNECTS {label: 'leads to'}]->(b)`).board;

describe('an item announced', () => {
  test('says its kind, its text and what it joins', () => {
    const a = BOARD.items.find((i) => i.id === 'a');
    const said = itemSaid(BOARD, a);
    assert.match(said, /Sticky note/);
    assert.match(said, /Go by train/);
    assert.match(said, /Paris/);
    assert.match(said, /leads to/);
  });

  test('is each item’s title in the picture, for a screen reader', () => {
    const svg = boardSvg(BOARD, PALETTES.light);
    assert.match(svg, /<title>Sticky note: Go by train[^<]*<\/title>/);
  });
});

describe('the outline', () => {
  test('lists every item once, with what a frame holds under it', () => {
    const outline = boardOutline(BOARD);
    assert.deepEqual(
      outline.map((l) => [l.depth, l.id]),
      [
        [0, 'c'],
        [1, 'a'],
        [1, 'b'],
        [0, 'e'],
      ],
    );
    assert.match(outline[0].said, /Frame: Travel/);
  });

  test('reads the board top to bottom, then left to right', () => {
    const board = readBoard(
      `// graph: w · BOARD\n(b:Sticky {x: 300, y: 0, text: 'B'}),\n(c:Sticky {x: 0, y: 400, text: 'C'}),\n(a:Sticky {x: 0, y: 0, text: 'A'})`,
    ).board;
    assert.deepEqual(
      boardOutline(board).map((l) => l.id),
      ['a', 'b', 'c'],
    );
  });
});
