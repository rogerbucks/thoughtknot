// proves: board_presence, board_offline_merge
// A shared board drawn with the others on it (editor spec §45, board_presence, board_offline_merge). Each other
// person wears a shape and an initial as well as a colour, on their pointer and on a ring round what they selected.
// Presence is a picture only: the board's own picture and text do not carry it. A clash flagged by a merge shows on
// its item, is said in words, and is settled by taking the flag off and nothing else.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard, writeBoard } from '../src/board.ts';
import { boardEdit } from '../src/board-edit.ts';
import { clashOf, clashed, settled } from '../src/board-clash.ts';
import { boardSvg, itemSaid } from '../src/board-svg.ts';
import { presenceSvg } from '../src/board-together.ts';
import { PALETTES } from '../src/palette.ts';

const NOW = 1_000_000;
const BOARD = readBoard(`// graph: ideas · BOARD
(a:Sticky {x: 10, y: 20, text: 'Go by train'}),
(b:Sticky {x: 300, y: 20, text: 'Go by boat', clash: 'b2'}),
(b2:Sticky {x: 300, y: 200, text: 'Go by plane', clash: 'b'})`).board;
const palette = PALETTES.light;
const peers = [
  { id: 'me', name: 'Ada', selection: [], seen: NOW },
  { id: 'bo', name: 'Bo', pointer: [50, 60], selection: ['a'], seen: NOW - 1000 },
  { id: 'cy', name: 'Cy', selection: ['b'], seen: NOW - 2000 },
  { id: 'old', name: 'Old', pointer: [1, 1], selection: [], seen: NOW - 120_000 },
];

describe('the others drawn over the board', () => {
  const svg = presenceSvg(BOARD, peers, 'me', palette, NOW);

  test('leaves out this person and anyone unheard from for too long', () => {
    assert.match(svg, /data-peer="bo"/);
    assert.match(svg, /data-peer="cy"/);
    assert.doesNotMatch(svg, /data-peer="me"/);
    assert.doesNotMatch(svg, /data-peer="old"/);
  });

  test('gives each person a shape of their own and their initial, not a colour alone', () => {
    const shape = (id) => svg.match(new RegExp(`data-peer="${id}" data-shape="(\\w+)"`))?.[1];
    assert.notEqual(shape('bo'), shape('cy'));
    assert.match(svg, />B</);
    assert.match(svg, />C</);
  });

  test('rings what each has selected and marks where their pointer is', () => {
    const bo = svg.slice(svg.indexOf('data-peer="bo"'), svg.indexOf('data-peer="cy"'));
    assert.match(bo, /<rect x="7" y="17"/);
    assert.match(bo, /M43 60/);
  });

  test('is for the eye alone: hidden from a screen reader and out of the pointer’s way', () => {
    assert.match(svg, /^<g class="thoughtknot-presence" aria-hidden="true" pointer-events="none">/);
  });

  test('is not in the board’s own picture, and a board with nobody else on it draws nothing', () => {
    assert.doesNotMatch(boardSvg(BOARD, palette), /thoughtknot-presence/);
    assert.equal(
      presenceSvg(BOARD, [peers[0]], 'me', palette, NOW),
      '<g class="thoughtknot-presence" aria-hidden="true" pointer-events="none"></g>',
    );
  });
});

describe('a clash flagged by a merge', () => {
  test('is found on its items, and drawn and said on each', () => {
    assert.deepEqual(
      clashed(BOARD).map((i) => i.id),
      ['b', 'b2'],
    );
    assert.equal(clashOf(BOARD.items[1]), 'b2');
    assert.equal(clashOf(BOARD.items[0]), undefined);
    const svg = boardSvg(BOARD, palette);
    assert.match(svg, /data-clash="b2"/);
    assert.match(itemSaid(BOARD, BOARD.items[1]), /Clashed with b2: both sides are kept/);
    assert.doesNotMatch(itemSaid(BOARD, BOARD.items[0]), /Clashed/);
  });

  test('is settled by taking its flag off, and nothing else moves or changes', () => {
    const item = settled(BOARD.items[1]);
    assert.equal(clashOf(item), undefined);
    assert.deepEqual({ ...item, more: {} }, { ...BOARD.items[1], more: {} });
    const r = boardEdit(writeBoard(BOARD), { kind: 'put', item });
    assert.ok('text' in r);
    const after = readBoard(r.text).board;
    assert.deepEqual(
      clashed(after).map((i) => i.id),
      ['b2'],
    );
    assert.deepEqual(
      after.items.map((i) => [i.id, i.x, i.y]),
      BOARD.items.map((i) => [i.id, i.x, i.y]),
    );
  });
});
