// The PNG painter (editor spec §46, cowork_drawing). Cowork's sandbox has no picture library, so the skill paints the
// SVG itself. It paints the shapes and text Graphviz writes, says how many characters it could not paint, and never
// gives a blank picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { svgToPng } from '../bin/raster.ts';

const svg = (body, view = '0 0 200 100') =>
  `<svg width="200" style="background:#ffffff" viewBox="${view}" xmlns="http://www.w3.org/2000/svg">\n<g id="graph0" class="graph" transform="scale(1 1) rotate(0) translate(0 0)">\n${body}\n</g></svg>`;

const pixels = (made) => {
  const png = Buffer.from(made.png);
  const at = png.indexOf('IDAT');
  const rows = inflateSync(png.subarray(at + 4, at + 4 + png.readUInt32BE(at - 4)));
  return { rows, stride: made.width * 3 + 1 };
};
const pixel = (made, x, y) => {
  const { rows, stride } = pixels(made);
  return [...rows.subarray(y * stride + 1 + x * 3, y * stride + 4 + x * 3)];
};

test('a filled shape is painted in its own colour on the background', () => {
  const made = svg('<polygon style="fill:#ff0000;stroke:#000000" points="20,20 120,20 120,80 20,80 20,20"/>');
  const got = svgToPng(made, 400);
  assert.ok(!('why' in got), JSON.stringify(got));
  assert.equal(got.width, 400);
  assert.deepEqual(pixel(got, 200, 100), [255, 0, 0], 'inside the shape');
  assert.deepEqual(pixel(got, 380, 190), [255, 255, 255], 'outside it');
});

test('a six-digit colour is read whole, and a short one too', () => {
  const six = svgToPng(svg('<polygon style="fill:#fce9d6" points="0,0 200,0 200,100 0,100"/>'), 200);
  assert.deepEqual(pixel(six, 100, 50), [0xfc, 0xe9, 0xd6]);
  const short = svgToPng(svg('<polygon style="fill:#f00" points="0,0 200,0 200,100 0,100"/>'), 200);
  assert.deepEqual(pixel(short, 100, 50), [255, 0, 0]);
});

test('text is painted, and a character with no letter is counted and drawn as a question mark', () => {
  const plain = svgToPng(svg('<text style="fill:#000000" x="10" y="50" font-size="20">Hello</text>'), 400);
  assert.equal(plain.unknown, 0);
  assert.ok(new Set(pixels(plain).rows).size > 2, 'there are pixels of ink');
  const odd = svgToPng(svg('<text style="fill:#000000" x="10" y="50" font-size="20">Café ☕</text>'), 400);
  assert.equal(odd.unknown, 2);
});

test('a drawing with no size says why, and a PNG is never blank without a reason', () => {
  assert.ok('why' in svgToPng('<svg></svg>'));
  assert.ok('why' in svgToPng(svg('', '0 0 0 0')));
});
