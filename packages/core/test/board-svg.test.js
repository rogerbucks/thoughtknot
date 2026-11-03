// The board picture itself (editor spec §45): one SVG with a title on every item and an outline that lists the board.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { boardOutline, boardSvg } from '../src/board-svg.ts';
import { PALETTES } from '../src/palette.ts';

const BOARD = readBoard(`// graph: ideas · BOARD
(a:Sticky {x: 10, y: 20, text: 'Go by train'}),
(b:Card {x: 300, y: 20, w: 160, h: 90, text: 'Paris'}),
(a)-[:CONNECTS {label: 'leads to'}]->(b)`).board;

describe('the board picture', () => {
  test('is one svg that holds each item’s text', () => {
    const svg = boardSvg(BOARD, PALETTES.light);
    assert.match(svg, /^<svg/);
    assert.match(svg, /Go by train/);
    assert.match(svg, /Paris/);
  });

  test('has an outline that names every item', () => {
    const said = boardOutline(BOARD)
      .map((l) => l.said)
      .join(' ');
    assert.match(said, /Go by train/);
    assert.match(said, /Paris/);
  });
});
