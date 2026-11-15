// The words of a board's tools, layers and slide show (editor spec ES§45). Each key is lower-case and dotted.
// Each wording is said in plain words. What a wording asks for, such as {name} or {count}, is what the code gives it.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_TOOLS_SOURCE_WORDS as WORDS } from '../src/board-tools-source-words.ts';

describe('the words of a board’s tools, layers and slides', () => {
  // proves: board_tools
  test('every key is a board key, lower-case and dotted, and every wording is a sentence or a name', () => {
    for (const [key, said] of Object.entries(WORDS)) {
      assert.match(key, /^board(\.[a-z0-9-]+)+$/, key);
      assert.ok(said.trim().length > 1 && !said.includes('  '), `${key} is worded`);
    }
  });

  // proves: board_layers
  test('the words that act on a layer name it, and a row says how many items it holds', () => {
    for (const does of ['reveal', 'conceal', 'lock', 'up', 'down', 'rename', 'remove'])
      assert.match(WORDS[`board.layers.${does}`], /\{name\}/, does);
    assert.match(WORDS['board.layers.row'], /\{name\}.*\{count\}/);
    assert.match(WORDS['board.layers.show'], /\{name\}/);
  });

  // proves: board_slides
  test('the words that act on a slide name it by its title, and a row gives its place', () => {
    for (const does of ['earlier', 'later', 'skip', 'unskip'])
      assert.match(WORDS[`board.slides.${does}`], /\{title\}/, does);
    assert.match(WORDS['board.slides.row'], /\{n\}.*\{title\}/);
    assert.match(WORDS['board.slides.row-out'], /\{title\}/);
  });
});
