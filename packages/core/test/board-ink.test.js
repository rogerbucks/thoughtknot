// Pen and highlighter strokes on a board (editor spec ES§45, board_ink). A stroke is an Ink item. Its points are one
// text of whole-number pairs from its own corner, so it moves with its item and is read back as written.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard, itemGql } from '../src/board.ts';
import { inkHit, inkItem, inkPoints, inkSvg, penOf } from '../src/board-ink.ts';
import { BOARD_TOOLS, INK_TOOLS, toolPress } from '../src/board-tools.ts';
import { boardSvg, itemBox } from '../src/board-svg.ts';

const PALETTE = { text: '#111', edge: '#222', muted: '#333', fill: (h) => `fill-${h}`, blend: (h) => `ink-${h}` };
const PATH = [
  [100, 100],
  [110, 100],
  [120, 100],
  [130, 112],
  [150, 140],
];

describe('strokes on a board', () => {
  // proves: board_ink
  test('a pen path becomes an Ink item whose points run from its own corner and whose box holds them', () => {
    const item = inkItem('ink1', 'pen', PATH);
    assert.equal(item.kind, 'Ink');
    const pts = inkPoints(item);
    assert.ok(pts.length >= 2 && pts.length < PATH.length, 'the straight run is thinned away');
    const box = itemBox(item);
    for (const [x, y] of pts) assert.ok(x >= 0 && y >= 0 && x <= box.w && y <= box.h, 'every point is in the box');
    assert.deepEqual([item.x + pts[0][0], item.y + pts[0][1]], [100, 100], 'the first point is where it began');
    assert.equal(penOf(item), 'pen');
    assert.equal(item.style, undefined);
  });

  // proves: board_ink
  test('a highlighter is yellow and see-through, and a single press makes a dot', () => {
    const item = inkItem('ink2', 'highlighter', PATH);
    assert.equal(penOf(item), 'highlighter');
    assert.equal(item.style, 'yellow');
    assert.match(inkSvg(item, 'ink-yellow'), /stroke-opacity="0.45"/);
    const dot = inkItem('ink3', 'pen', [[40, 40]]);
    assert.equal(inkPoints(dot).length, 2, 'a dot is a stroke of two equal points');
    assert.equal(inkItem('ink4', 'pen', []), null, 'no path, no item');
  });

  // proves: board_ink
  test('a stroke is written as text, read back as it was and drawn as a path in the board picture', () => {
    const item = inkItem('ink1', 'pen', PATH);
    const text = `// graph: b · BOARD\n${itemGql(item)}`;
    const { board, problems } = readBoard(text);
    assert.equal(problems.length, 0);
    assert.deepEqual(inkPoints(board.items[0]), inkPoints(item));
    const svg = boardSvg(board, PALETTE);
    assert.match(svg, /<path d="M100 100/);
    assert.match(svg, /stroke="#111"/);
    assert.doesNotMatch(svg, /stroke-dasharray/, 'a stroke is not the dashed placeholder');
    assert.equal(inkSvg({ ...item, more: {} }, '#111'), null, 'an Ink item with no points keeps its placeholder');
  });

  // proves: board_ink
  test('the eraser finds a stroke near its spot and no other', () => {
    const item = inkItem('ink1', 'pen', PATH);
    assert.ok(inkHit(item, [110, 103], 3), 'near the line');
    assert.ok(inkHit(item, [150, 140], 0), 'on its end');
    assert.ok(!inkHit(item, [110, 150], 3), 'far from it');
    assert.ok(inkHit(inkItem('h', 'highlighter', PATH), [110, 106], 0), 'a wide stroke reaches further');
  });

  // proves: board_ink
  test('Pen, Highlighter and Eraser are tools worked by a drag: a press alone passes to the board', () => {
    assert.deepEqual(BOARD_TOOLS.slice(-3), ['pen', 'highlighter', 'eraser']);
    assert.deepEqual([...INK_TOOLS], ['pen', 'highlighter', 'eraser']);
    const board = readBoard('// graph: b · BOARD').board;
    for (const tool of INK_TOOLS) assert.deepEqual(toolPress(board, tool, null, [0, 0], null), { kind: 'pass' });
  });
});
