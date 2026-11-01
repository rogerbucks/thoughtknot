// Drawings kept as text (editor spec §70, sketch_is_text and sketch_checked). The drawings over a graph are a block of
// their own in the note. They are read with the board's reader and written back in one fixed form. A fault is a problem with its
// fix, and whatever can be read is kept, so it can still be drawn.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dataKind } from '../src/blocks.ts';
import { readSketch, sketchOf, writeSketch } from '../src/sketch.ts';

const BLOCK = `// graph: trip_ink · SKETCH ON trip
(a:Ink {x: 4, y: -30, style: 'red', pin: 'ann', points: '0 0 12 4 30 9'}),
(b:Shape {x: 0, y: 0, pin: 'team', shape: 'ellipse'}),
(c:Shape {x: 100, y: 200, w: 80, h: 40}),
(d:Shape {x: 10, y: 10, shape: 'arrow', points: '0 0 60 20'}),
(e:Text {x: 300, y: 40, text: 'Ask Bob'})`;

const codes = (problems) => problems.map((p) => [p.code, p.line]);

describe('a drawings block', () => {
  test('is known by its graph line, and is never data to draw as a graph', () => {
    assert.deepEqual(sketchOf(BLOCK), { name: 'trip_ink', on: 'trip' });
    assert.equal(sketchOf('// graph: trip'), null);
    assert.equal(sketchOf('// graph: ideas · BOARD ON trip'), null);
    assert.equal(dataKind(BLOCK), null);
  });

  test('holds each drawing with its kind, place, pin, shape, points, text and hue', () => {
    const { sketch, problems } = readSketch(BLOCK);
    assert.deepEqual(problems, []);
    assert.equal(sketch.on, 'trip');
    const [a, b, c, d, e] = sketch.items;
    assert.deepEqual(
      [a.kind, a.x, a.y, a.pin, a.style, a.points],
      [
        'Ink',
        4,
        -30,
        'ann',
        'red',
        [
          [0, 0],
          [12, 4],
          [30, 9],
        ],
      ],
    );
    assert.deepEqual([b.kind, b.pin, b.shape, b.w], ['Shape', 'team', 'ellipse', undefined]);
    assert.deepEqual([c.shape, c.w, c.h, c.pin], [undefined, 80, 40, undefined]);
    assert.deepEqual(
      [d.shape, d.points],
      [
        'arrow',
        [
          [0, 0],
          [60, 20],
        ],
      ],
    );
    assert.deepEqual([e.kind, e.text], ['Text', 'Ask Bob']);
  });

  test('is written in one fixed form, and read back is the same drawings', () => {
    const { sketch } = readSketch(BLOCK);
    const written = writeSketch(sketch);
    assert.equal(written, BLOCK);
    assert.deepEqual(readSketch(written).sketch, sketch);
  });

  test('keeps a pin, shape or points it cannot use, as written, so a write never loses them', () => {
    const block = `// graph: g_ink · SKETCH ON g
(a:Text {x: 0, y: 0, text: 'hi', shape: 'box', points: '1 2 3 4'}),
(b:Shape {x: 0, y: 0, w: 9, h: 9, pin: 7, shape: 'star'})`;
    const written = writeSketch(readSketch(block).sketch);
    assert.match(written, /\(a:Text \{[^}]*shape: 'box'[^}]*points: '1 2 3 4'/);
    assert.match(written, /\(b:Shape \{[^}]*pin: 7/);
    assert.match(written, /\(b:Shape \{[^}]*shape: 'star'/);
  });

  test('keeps a property it does not know, as written', () => {
    const { sketch } = readSketch(`// graph: g_ink · SKETCH ON g\n(a:Text {x: 0, y: 0, text: 'hi', by: 'Roger'})`);
    assert.deepEqual(sketch.items[0].more, { by: 'Roger' });
    assert.match(writeSketch(sketch), /by: 'Roger'/);
  });
});

describe('a drawings block checked', () => {
  test('a kind that is not a drawing’s is a problem with its fix, and the rest is still read', () => {
    const { sketch, problems } = readSketch(`// graph: g_ink · SKETCH ON g
(a:Sticky {x: 0, y: 0, text: 'not here'}),
(b:Text {x: 0, y: 0, text: 'kept'})`);
    assert.deepEqual(codes(problems), [['GN905', 2]]);
    assert.match(problems[0].fix, /Ink, Shape, Text/);
    assert.deepEqual(
      sketch.items.map((i) => i.id),
      ['b'],
    );
  });

  test('a shape it does not know is a problem, and is drawn as a box', () => {
    const { sketch, problems } = readSketch(
      `// graph: g_ink · SKETCH ON g\n(a:Shape {x: 0, y: 0, w: 9, h: 9, shape: 'star'})`,
    );
    assert.deepEqual(codes(problems), [['GN907', 2]]);
    assert.equal(sketch.items.length, 1);
    assert.equal(sketch.items[0].shape, undefined);
  });

  test('points that are not pairs of numbers are a problem, and that drawing alone is left out', () => {
    const { sketch, problems } = readSketch(`// graph: g_ink · SKETCH ON g
(a:Ink {x: 0, y: 0, points: '0 0 5'}),
(b:Shape {x: 0, y: 0, shape: 'line', points: 'a b c d'}),
(c:Ink {x: 0, y: 0}),
(d:Ink {x: 0, y: 0, points: '0 0 5 5'})`);
    assert.deepEqual(codes(problems), [
      ['GN908', 2],
      ['GN908', 3],
      ['GN908', 4],
    ]);
    assert.deepEqual(
      sketch.items.map((i) => i.id),
      ['d'],
    );
  });

  test('a place that is not whole numbers is the board’s problem, as on a board', () => {
    const { problems } = readSketch(`// graph: g_ink · SKETCH ON g\n(a:Text {x: 'left', y: 0, text: 'hi'})`);
    assert.deepEqual(codes(problems), [['GN902', 2]]);
  });
});
