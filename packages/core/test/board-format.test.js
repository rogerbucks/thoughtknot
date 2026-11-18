// How an item of a board looks (editor spec ES§45, board_format): a colour, a line, a size of words and bold. Each
// is a property of the item in the board block. One change sets the look of several items, and a locked one keeps its.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { boardEdit } from '../src/board-edit.ts';
import { formatOf, formatPatch, sharedFormat } from '../src/board-format.ts';
import { boardSvg } from '../src/board-svg.ts';

const PALETTE = { text: '#111', edge: '#222', muted: '#333', fill: (h) => `fill-${h}`, blend: (h) => `ink-${h}` };

const TEXT = `// graph: ideas · BOARD
(a:Sticky {x: 0, y: 0, text: 'Go by train'}),
(b:Card {x: 300, y: 0, text: 'Paris', locked: true}),
(c:Shape {x: 600, y: 0, text: 'Hub'}),
(h:Ink {x: 0, y: 300, w: 40, h: 10, points: '0 0 40 10', pen: 'highlighter', style: 'yellow'})`;

const drawn = (text, id) =>
  boardSvg(readBoard(text).board, PALETTE).match(new RegExp(`<g[^>]*data-item="${id}"[\\s\\S]*?</g>`))[0];

describe('the look of an item of a board', () => {
  // proves: board_format
  test('one change sets the look of several items as text in the note, and a locked item keeps its look', () => {
    const set = { colour: 'blue', line: 'dotted', size: 'large', bold: true };
    const { text } = boardEdit(TEXT, { kind: 'formats', ids: ['a', 'b', 'c'], set });
    assert.match(
      text,
      /\(a:Sticky \{x: 0, y: 0, text: 'Go by train', style: 'blue', line: 'dotted', size: 'large', bold: true\}\)/,
    );
    assert.match(text, /\(c:Shape \{[^}]*style: 'blue', line: 'dotted', size: 'large', bold: true\}\)/);
    assert.ok(text.includes("(b:Card {x: 300, y: 0, text: 'Paris', locked: true})"), 'the locked one is as it was');
    assert.deepEqual(formatOf(readBoard(text).board.items[0]), set);
    assert.match(boardEdit(TEXT, { kind: 'formats', ids: ['b'], set }).refused, /locked/);
  });

  // proves: board_format
  test('is drawn: the hue, the dashes of the line, larger words and bold; a plain item is drawn as its kind is', () => {
    const { text } = boardEdit(TEXT, {
      kind: 'formats',
      ids: ['a'],
      set: { colour: 'pink', line: 'dashed', size: 'large', bold: true },
    });
    const a = drawn(text, 'a');
    assert.match(a, /fill="fill-pink" stroke="ink-pink" stroke-dasharray="6 4"/);
    assert.match(a, /font-weight="bold"/);
    const size = (g) => Number(g.match(/font-size="([\d.]+)"/)[1]);
    assert.equal(size(a), size(drawn(TEXT, 'a')) * 1.5);
    assert.doesNotMatch(drawn(TEXT, 'a'), /stroke-dasharray|font-weight/);
    const small = boardEdit(TEXT, { kind: 'formats', ids: ['a'], set: { size: 'small' } }).text;
    assert.ok(size(drawn(small, 'a')) < size(drawn(TEXT, 'a')));
    const dotted = boardEdit(TEXT, { kind: 'formats', ids: ['h'], set: { line: 'dotted' } }).text;
    assert.match(drawn(dotted, 'h'), /<path [^>]*stroke-dasharray="2 4"/, 'a stroke takes a line too');
  });

  // proves: board_format
  test('a look made plain again is taken off the item, so the note reads as it did before', () => {
    const set = { colour: 'green', line: 'solid', size: 'small', bold: true };
    const { text } = boardEdit(TEXT, { kind: 'formats', ids: ['a', 'c'], set });
    const plain = { colour: null, line: null, size: 'normal', bold: false };
    assert.equal(boardEdit(text, { kind: 'formats', ids: ['a', 'c'], set: plain }).text, TEXT);
    const only = boardEdit(text, { kind: 'formats', ids: ['a'], set: { bold: false } }).text;
    assert.match(
      only,
      /\(a:Sticky \{[^}]*style: 'green', line: 'solid', size: 'small'\}\)/,
      'only what is named changes',
    );
    const h = readBoard(TEXT).board.items[3];
    assert.equal(formatPatch(h, { colour: null }).style, 'yellow', 'a highlighter with no colour is yellow again');
    assert.equal(formatPatch(h, { colour: 'mauve' }).style, 'yellow', 'a hue not known is no colour');
  });

  // proves: board_format
  test('says the look several items share, and nothing for a part in which they differ', () => {
    const { text } = boardEdit(TEXT, { kind: 'formats', ids: ['a'], set: { colour: 'blue', bold: true } });
    const [a, , c] = readBoard(text).board.items;
    assert.deepEqual(sharedFormat([a]), { colour: 'blue', line: null, size: 'normal', bold: true });
    assert.deepEqual(sharedFormat([a, c]), { line: null, size: 'normal' });
    assert.deepEqual(sharedFormat([]), {});
    const odd = { ...a, style: 'mauve', more: { line: 'wavy', size: 'huge', bold: 'yes' } };
    assert.deepEqual(
      formatOf(odd),
      { colour: null, line: null, size: 'normal', bold: false },
      'unknown words are plain',
    );
  });
});
