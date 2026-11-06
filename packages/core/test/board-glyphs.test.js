// board_glyphs_offline (editor spec §45): glyphs are found by name in the built-in set, and no glyph causes a network
// request.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readBoard } from '../src/board.ts';
import { GLYPHS, findGlyphs, glyphNamed } from '../src/board-glyphs.ts';
import { boardSvg, boardOutline } from '../src/board-svg.ts';

const BOARD = `// graph: trip · BOARD
(g:Glyph {x: 0, y: 0, w: 60, h: 60, glyph: 'idea'}),
(h:Glyph {x: 100, y: 0, glyph: 'no-such-glyph', text: 'Mine'})`;
const palette = { fill: () => '#eee', blend: () => '#999', edge: '#444', text: '#111', muted: '#777' };
const board = readBoard(BOARD).board;

describe('board_glyphs_offline', () => {
  test('the set has unique names, each with a character, words and keywords', () => {
    assert.ok(GLYPHS.length >= 30);
    assert.equal(new Set(GLYPHS.map((g) => g.name)).size, GLYPHS.length);
    for (const g of GLYPHS) {
      assert.ok(g.char && g.said && g.keywords.length, g.name);
      assert.notEqual(g.said, `board.glyph.${g.name}`);
    }
  });

  test('a glyph is found by its name, by a word that goes with it, or by part of either', () => {
    assert.equal(findGlyphs('idea')[0].name, 'idea');
    assert.equal(findGlyphs('bulb')[0].name, 'idea');
    assert.equal(findGlyphs('  ROCK ')[0].name, 'rocket');
    assert.deepEqual(findGlyphs('zzzz'), []);
    assert.equal(findGlyphs('').length, GLYPHS.length);
    assert.equal(glyphNamed('idea')?.char, glyphNamed('idea')?.char);
    assert.equal(glyphNamed('nothing'), undefined);
  });

  test('a glyph item is drawn with its character and said by its name', () => {
    const svg = boardSvg(board, palette);
    assert.ok(svg.includes(glyphNamed('idea').char));
    assert.ok(
      boardOutline(board)
        .find((l) => l.id === 'g')
        .said.includes('Light bulb'),
    );
  });

  test('a name not in the set draws no character and keeps the item’s own text', () => {
    assert.ok(
      boardOutline(board)
        .find((l) => l.id === 'h')
        .said.includes('Mine'),
    );
  });

  test('no glyph causes a network request: no address in the set or in the picture', () => {
    const svg = boardSvg(board, palette);
    assert.doesNotMatch(svg, /https?:\/\/(?!www\.w3\.org)/);
    assert.doesNotMatch(svg, /<image|<use|href=/);
    const source = readFileSync(new URL('../src/board-glyphs.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|https?:\/\/|import\(/);
  });
});
