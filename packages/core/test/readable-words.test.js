// Names readable at any zoom in 2D (editor spec §3, names_readable_any_zoom): readable-words.ts. A name never shows under
// 9 pixels: drawn smaller, it grows about its middle with its rows. One that would then cover another is left out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { READABLE_LEAST, READABLE_MOST, readableWords } from '../src/view-types/readable-words.ts';

/** A one-row name of `letters` letters in `group`, centred at (`x`, `y`), `size` units tall. */
const word = (group, x, y, letters = 6, size = 12) => ({ group, x, y, size, anchor: 'middle', letters });
/** The same, inside its thing's box. */
const boxed = (...a) => ({ ...word(...a), inside: true });

// proves: names_readable_any_zoom
test('a name drawn under 9 pixels grows to 9 about its middle; one large enough is left as it is', () => {
  const [far] = readableWords([word('a', 100, 50)], 0.25);
  assert.equal(far.size * 0.25, READABLE_LEAST, 'shown at 9 pixels');
  assert.deepEqual([far.x, far.y, far.hidden], [100, 50, false], 'in the same place');
  const [inside] = readableWords([boxed('a', 100, 50)], 2);
  assert.deepEqual(inside, { size: 12, x: 100, y: 50, hidden: false }, 'a name in its box grows with it');
  const [beside] = readableWords([word('a', 100, 50)], 2);
  assert.equal(beside.size * 2, READABLE_MOST, 'a name beside its thing keeps to the most');
});

// proves: names_readable_any_zoom
test('names beside their things that cover one another show as you zoom in, as on a map', () => {
  const close = [word('a', 100, 50), word('b', 120, 50)];
  const hidden = (k) => readableWords(close, k).filter((s) => s.hidden).length;
  assert.equal(hidden(1), 1, 'drawn as laid out, they overlap');
  assert.equal(hidden(6), 0, 'zoomed in, both show');
});

// proves: names_readable_any_zoom
test('the rows of one name grow together, keeping their spacing, and never hide one another', () => {
  const rows = [word('a', 100, 40, 8), word('a', 100, 56, 6, 9)];
  const shown = readableWords(rows, 0.25);
  assert.ok(shown.every((s) => !s.hidden));
  assert.ok(shown[1].size * 0.25 >= READABLE_LEAST - 1e-9, 'the smaller row is readable too');
  assert.ok(shown[1].y - shown[0].y > 16, 'pushed apart about their middle');
  assert.equal((shown[0].y + shown[1].y) / 2, 48, 'the middle stays');
});

// proves: names_readable_any_zoom
test('a name that would cover another is left out, the picked one first; zooming in shows both', () => {
  const two = [word('a', 100, 50), word('b', 160, 50)];
  const out = readableWords(two, 0.25);
  assert.deepEqual(
    out.map((s) => s.hidden),
    [false, true],
    'the first in the drawing keeps its place',
  );
  assert.deepEqual(
    readableWords(two, 0.25, ['b']).map((s) => s.hidden),
    [true, false],
    'the picked one is placed first',
  );
  const larger = [word('a', 100, 50, 6, 8), word('b', 160, 50, 6, 14)];
  assert.deepEqual(
    readableWords(larger, 0.25).map((s) => s.hidden),
    [true, false],
    'else the largest',
  );
  assert.ok(
    readableWords(two, 3).every((s) => !s.hidden),
    'zoomed in, both show',
  );
});
