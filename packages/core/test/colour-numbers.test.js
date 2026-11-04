// A colour as numbers, for a painter on the graphics chip (editor spec §53, scale_gpu_painters): colour-numbers.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FADED, haloFor, rgbaOf, seeThrough } from '../src/colour-numbers.ts';
import { canvasSpacePainter } from '../src/display/graph-view/space-canvas-painter.ts';
import { orbitFit, spaceMatrix } from '../src/space-view.ts';
import { BLOCK_NUMBERS, spaceNumbers } from '../src/display/graph-view/space-painter.ts';

test('a colour in hex digits is four numbers from 0 to 1, opaque when it says nothing of how opaque', () => {
  assert.deepEqual(rgbaOf('#ff8000'), [1, 128 / 255, 0, 1]);
  assert.deepEqual(rgbaOf('#FF800080'), [1, 128 / 255, 0, 128 / 255]);
});

test('a colour as red, green and blue numbers is four numbers, with how opaque when given', () => {
  assert.deepEqual(rgbaOf('rgb(255, 0, 51)'), [1, 0, 0.2, 1]);
  assert.deepEqual(rgbaOf('rgba(0, 255, 0, 0.5)'), [0, 1, 0, 0.5]);
  assert.deepEqual(rgbaOf('rgb(0 0 255 / 0.25)'), [0, 0, 1, 0.25]);
});

test('anything else is clear, so a colour the canvas could not read is not painted', () => {
  for (const css of ['', 'red', 'var(--gn-text)', '#12345', 'rgb(1, 2)'])
    assert.deepEqual(rgbaOf(css), [0, 0, 0, 0], css);
});

test('a colour a theme mixes is read too: a canvas writes it back as color(srgb …)', () => {
  assert.deepEqual(rgbaOf('color(srgb 1 0.5 0)'), [1, 0.5, 0, 1]);
  assert.deepEqual(rgbaOf('color(srgb 0.2 0.4 0.6 / 0.5)'), [0.2, 0.4, 0.6, 0.5]);
});

// proves: focus_space
test('a colour faded for the 3D view keeps its red, green and blue, and is a part as opaque as it was', () => {
  assert.equal(seeThrough('rgb(255, 0, 51)', FADED), 'rgb(255 0 51 / 0.3)');
  assert.equal(seeThrough('rgba(0, 255, 0, 0.5)', 0.5), 'rgb(0 255 0 / 0.25)');
  assert.equal(seeThrough('color(srgb 1 0.5 0)', 1), 'rgb(255 128 0 / 1)');
  assert.deepEqual(
    rgbaOf(seeThrough('rgb(10, 20, 30)', FADED)),
    [10 / 255, 20 / 255, 30 / 255, 0.3],
    'read back as it is',
  );
});

// proves: space_colours_any_form
test('a colour in a wider form a theme may use or mix in is read as the browser paints it, never as black', () => {
  // each as Chrome paints it on one pixel (red, green, blue and how opaque, from 0 to 255)
  const painted = {
    'oklab(0.539974 0.0962086 -0.0928316)': [140, 83, 162, 255],
    'oklch(0.7 0.1 200)': [64, 177, 183, 255],
    'oklch(62.8% 0.2577 29.23 / 0.5)': [255, 0, 0, 128],
    'lab(50 20 30)': [161, 105, 69, 255],
    'lch(60 40 120)': [125, 154, 81, 255],
    'color(display-p3 1 0 0)': [255, 0, 0, 255],
    'color(display-p3 0.2 0.6 0.4)': [0, 156, 97, 255],
    'color(srgb-linear 0.2 0.5 0.8)': [124, 188, 231, 255],
  };
  for (const [css, want] of Object.entries(painted))
    assert.deepEqual(
      rgbaOf(css).map((n) => Math.round(n * 255)),
      want,
      css,
    );
  assert.deepEqual(
    rgbaOf('oklch(1 0 none)').map((n) => Math.round(n * 255)),
    [255, 255, 255, 255],
    'a hue of none is white with no colour',
  );
  assert.deepEqual(rgbaOf('color(rec2020 1 0 0)'), [0, 0, 0, 0], 'a space not known is still clear');
  assert.equal(seeThrough('oklab(0.539974 0.0962086 -0.0928316)', FADED), 'rgb(140 83 162 / 0.3)', 'faded too');
});

// proves: space_colours_any_form
test('a ball or block with a clear fill is painted in its outline colour on the graphics chip, never black', () => {
  const block = (style) => ({ id: style, style, x: 0, y: 0, width: 10, depth: 10, floor: 0, tall: 10 });
  const space = {
    blocks: [block('clear'), block('filled')],
    lines: [],
    labels: [],
    arrows: [],
    least: [0, 0, 0],
    most: [1, 1, 1],
  };
  const paints = (style) =>
    style === 'clear'
      ? { fill: 'rgba(0, 0, 0, 0)', line: 'oklch(0.7 0.1 200)' }
      : { fill: 'rgb(255 0 0 / 0.5)', line: '#000000' };
  const { blocks } = spaceNumbers(space, paints);
  const fillOf = (i) =>
    [...blocks.slice(i * BLOCK_NUMBERS + 6, i * BLOCK_NUMBERS + 10)].map((n) => Math.round(n * 255));
  assert.deepEqual(fillOf(0), [64, 177, 183, 255], 'its outline colour');
  assert.deepEqual(fillOf(1), [255, 0, 0, 128], 'a fill that shows is kept');
});

// Every 3D painter fills a thing solid, in one colour. Roger, 4 Nov 2026: balls were black on a Mac and an iPhone.
/** A 2D canvas that keeps each colour it fills with, as `fills` says. */
function fakeCanvas() {
  const fills = [],
    kept = { fillStyle: '', createRadialGradient: () => ({ addColorStop() {} }) };
  kept.fill = () => fills.push(kept.fillStyle);
  const ctx = new Proxy(kept, { get: (o, k) => (k in o ? o[k] : () => {}) });
  return { canvas: { width: 0, height: 0, getContext: () => ctx }, fills };
}

const blockOf = (style) => ({ id: style, style, x: 0, y: 0, width: 10, depth: 10, floor: 0, tall: 10 });
const spaceOf = (round) => ({
  blocks: [blockOf('faint'), blockOf('clear')],
  lines: [],
  labels: [],
  arrows: [],
  round,
  least: [0, 0, 0],
  most: [10, 10, 10],
});
// as Obsidian's palette fills a thing: its hue at 16% (palette.ts), over a page the canvas does not see
const PAINTS = (style) =>
  style === 'faint'
    ? { fill: 'rgba(0, 191, 188, 0.16)', line: 'rgb(0, 191, 188)' }
    : { fill: 'rgba(0, 0, 0, 0)', line: 'rgb(255, 0, 0)' };

// proves: space_colours_any_form
test('the 2D canvas painter fills a ball or a box solid, as the graphics chip does, never faint or black', () => {
  for (const round of [true, false]) {
    const { canvas, fills } = fakeCanvas();
    const painter = canvasSpacePainter(canvas);
    painter.resize(400, 400, 1);
    const space = spaceOf(round);
    painter.paint(space, spaceMatrix(orbitFit(space, 1), 1, 30), PAINTS);
    const solid = fills.filter((f) => typeof f === 'string');
    assert.ok(solid.includes('rgb(0, 191, 188)'), `${round ? 'a ball' : 'a box'} with a faint fill: ${solid}`);
    assert.ok(solid.includes('rgb(255, 0, 0)'), `${round ? 'a ball' : 'a box'} with no fill takes its outline's`);
    assert.ok(!solid.some((f) => f.startsWith('rgba')), 'no faint or clear fill is painted as it is');
  }
});

// proves: space_colours_any_form
test('words in 3D keep a halo they stand out on, even where no page colour is painted behind them', () => {
  assert.equal(haloFor('rgb(30, 30, 30)', 'rgb(220, 221, 222)'), 'rgb(30, 30, 30)', 'a dark page round light words');
  assert.equal(haloFor('rgb(255, 255, 255)', 'rgb(34, 34, 34)'), 'rgb(255, 255, 255)', 'a light page round dark words');
  assert.equal(haloFor('Canvas', 'rgb(220, 221, 222)'), 'rgb(0, 0, 0)', 'no page known: dark round light words');
  assert.equal(haloFor('Canvas', 'rgb(34, 34, 34)'), 'rgb(255, 255, 255)', 'no page known: light round dark words');
  assert.equal(haloFor('rgb(250, 250, 250)', 'rgb(220, 221, 222)'), 'rgb(0, 0, 0)', 'never light round light words');
  assert.equal(haloFor('rgb(30, 30, 30)', 'CanvasText'), 'rgb(30, 30, 30)', 'words of no known colour keep the page');
});
