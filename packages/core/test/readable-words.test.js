// Names that scale with their things in 2D (editor spec §3, names_readable_any_zoom): readable-words.ts. A name keeps
// its size in the drawing; the busiest thing's is named first, and larger. One that would cover another is left out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUB_LARGER, SHOWN_LEAST, readableWords } from '../src/view-types/readable-words.ts';
import { LETTER } from '../src/view-types/fit-text.ts';
import { NAME_CEILING } from '../src/view-types/type-scale.ts';

/** A one-row name of `letters` letters in `group`, centred at (`x`, `y`), `size` units tall. */
const word = (group, x, y, letters = 6, size = 12) => ({ group, x, y, size, anchor: 'middle', letters });
/** The same, inside its thing's box. */
const boxed = (...a) => ({ ...word(...a), inside: true });

// proves: names_readable_any_zoom
test('a name keeps its size in the drawing, so it scales with its thing; hiding small ones is a choice', () => {
  const [far] = readableWords([word('a', 100, 50)], 0.25);
  assert.deepEqual(far, { size: 12, x: 100, y: 50, hidden: false }, 'shown at 3 pixels, never blown up');
  const [hid] = readableWords([word('a', 100, 50)], 0.25, [], undefined, new Map(), true);
  assert.ok(hid.hidden, `under ${SHOWN_LEAST} pixels, hidden when asked`);
  const [near] = readableWords([word('a', 100, 50)], 1, [], undefined, new Map(), true);
  assert.ok(!near.hidden && near.size === 12, 'zoomed in, it shows as drawn');
});

// proves: names_readable_any_zoom
test('where names would overlap, the busiest thing is named first, and larger', () => {
  const two = [word('a', 100, 50), word('b', 120, 50)];
  const out = readableWords(
    two,
    1,
    [],
    undefined,
    new Map([
      ['b', 8],
      ['a', 1],
    ]),
  );
  assert.deepEqual(
    out.map((s) => s.hidden),
    [true, false],
    'the thing with more links keeps its name',
  );
  assert.ok(Math.abs(out[1].size - 12 * HUB_LARGER) < 1e-9, 'the busiest is drawn larger');
  assert.ok(out[0].size > 12 && out[0].size < out[1].size, 'a quieter one less so');
  const [boxed1] = readableWords([boxed('b', 100, 50)], 1, [], undefined, new Map([['b', 8]]));
  assert.equal(boxed1.size, 12, 'a name inside its box keeps its size, so it fits');
});

// proves: names_readable_any_zoom
test('the rows of one name grow together about their middle, and never hide one another', () => {
  const rows = [word('a', 100, 40, 8), word('a', 100, 56, 6, 9)];
  const shown = readableWords(rows, 1, [], undefined, new Map([['a', 4]]));
  assert.ok(shown.every((s) => !s.hidden));
  assert.ok(shown[1].y - shown[0].y > 16, 'pushed apart about their middle');
  assert.equal((shown[0].y + shown[1].y) / 2, 48, 'the middle stays');
});

// proves: names_readable_any_zoom
test('the picked thing is named before the busiest; else the largest, then the first drawn', () => {
  const two = [word('a', 100, 50), word('b', 120, 50)];
  assert.deepEqual(
    readableWords(two, 1, ['a'], undefined, new Map([['b', 8]])).map((s) => s.hidden),
    [false, true],
    'the picked one is placed first',
  );
  assert.deepEqual(
    readableWords(two, 1).map((s) => s.hidden),
    [false, true],
    'with no links, the first in the drawing keeps its place',
  );
  const larger = [word('a', 100, 50, 6, 8), word('b', 110, 50, 6, 14)];
  assert.deepEqual(
    readableWords(larger, 1).map((s) => s.hidden),
    [true, false],
    'else the largest',
  );
});

// proves: names_readable_any_zoom
test('a name past the edge of the view is nudged back in, so it is not cut off', () => {
  const view = { left: 0, top: 0, right: 200, bottom: 100 };
  const [edge] = readableWords([word('a', 195, 50)], 1, [], view);
  const half = (6 * edge.size * LETTER) / 2;
  assert.ok(edge.x + half <= 200 + 1e-9 && edge.x < 195, 'moved in from the right edge');
  const [away] = readableWords([word('a', 400, 50)], 1, [], view);
  assert.equal(away.x, 400, 'a thing out of view keeps its name where it is');
});

// proves: names_readable_any_zoom
test('zoomed far in, a name stops growing at the ceiling, so its thing shows larger and the name stays readable', () => {
  const [mid] = readableWords([word('a', 100, 50)], 1.2);
  assert.equal(mid.size * 1.2, 12 * 1.2, 'under the ceiling it scales with its thing');
  for (const k of [2, 8, 40]) {
    const [near] = readableWords([word('a', 100, 50)], k);
    assert.ok(Math.abs(near.size * k - NAME_CEILING) < 1e-9, `${near.size * k} pixels at ${k}×`);
    const [inBox] = readableWords([boxed('b', 100, 50)], k);
    assert.ok(inBox.size * k <= NAME_CEILING + 1e-9, 'a name in its box stops too');
  }
  const two = [word('a', 100, 50, 6, 12), word('a', 100, 70, 6, 12)];
  const rows = readableWords(two, 10);
  assert.ok(
    Math.abs(rows[1].y - rows[0].y - (20 * NAME_CEILING) / 120) < 1e-9,
    'its rows shrink together, as one name',
  );
  const [hub] = readableWords([word('h', 100, 50), word('q', 900, 50)], 20, [], undefined, new Map([['h', 9]]));
  assert.ok(
    hub.size * 20 <= NAME_CEILING * HUB_LARGER + 1e-9 && hub.size * 20 > NAME_CEILING,
    'the busiest a bit larger',
  );
});
