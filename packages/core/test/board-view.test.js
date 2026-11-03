// Drawing a board (editor spec §45, board_view). The core turns a board into one SVG picture in the host's colours.
// Each item is drawn at its place and size, by its kind. Each connector is a line with an arrow and its label. Only
// what is in view is drawn, so a large board stays quick. Pan and zoom are the host's, as for a drawing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { boardSvg, itemBox } from '../src/board-svg.ts';
import { PALETTES } from '../src/palette.ts';

const BOARD = readBoard(`// graph: ideas · BOARD
(a:Sticky {x: 10, y: 20, text: 'Go by train'}),
(b:Card {x: 300, y: 20, w: 160, h: 90, text: 'Paris & <back>'}),
(c:Frame {x: 0, y: 0, w: 600, h: 300, layer: -1, text: 'Travel'}),
(d:Sticky {x: 5000, y: 5000, text: 'Far away'}),
(a)-[:CONNECTS {label: 'leads to'}]->(b)`).board;

const palette = PALETTES.light;

describe('an item’s box', () => {
  test('is its own size where written, else its kind’s', () => {
    const [a, b] = BOARD.items;
    assert.deepEqual(itemBox(b), { x: 300, y: 20, w: 160, h: 90 });
    const sticky = itemBox(a);
    assert.equal(sticky.x, 10);
    assert.ok(sticky.w > 0 && sticky.h > 0);
  });
});

describe('the board drawn', () => {
  const svg = boardSvg(BOARD, palette);

  test('is one SVG picture with a title naming the board', () => {
    assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    assert.match(svg, /<title>[^<]*ideas[^<]*<\/title>/);
  });

  test('draws each item with its id, so a host can tell what was tapped', () => {
    for (const id of ['a', 'b', 'c', 'd']) assert.match(svg, new RegExp(`data-item="${id}"`));
  });

  test('draws lower layers first, so a frame sits behind what it holds', () => {
    assert.ok(svg.indexOf('data-item="c"') < svg.indexOf('data-item="a"'));
  });

  test('escapes every word', () => {
    assert.match(svg, /Paris &amp; &lt;back&gt;/);
    assert.doesNotMatch(svg, /<back>/);
  });

  test('draws a connector as a line with an arrow and its label', () => {
    assert.match(svg, /data-connector="a-b"/);
    assert.match(svg, /marker-end=/);
    assert.match(svg, />leads to</);
  });

  test('uses the host’s colours only', () => {
    assert.ok(svg.includes(palette.fill('yellow')), 'a sticky is filled in the palette’s yellow');
  });
});

describe('only what is in view is drawn', () => {
  test('an item outside the view is left out, and so is a connector with neither end in it', () => {
    const svg = boardSvg(BOARD, palette, { x: 0, y: 0, w: 1000, h: 800 });
    assert.match(svg, /data-item="a"/);
    assert.doesNotMatch(svg, /data-item="d"/);
  });

  test('a connector with one end in view is still drawn', () => {
    const svg = boardSvg(BOARD, palette, { x: 0, y: 0, w: 200, h: 200 });
    assert.match(svg, /data-connector="a-b"/);
  });
});
