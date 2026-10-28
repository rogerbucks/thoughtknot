// Drawings placed against the graph's drawing (editor spec §70, sketch_pinned, sketch_pin_hidden and sketch_keyboard).
// A drawing pinned to a thing or group moves with it when the layout moves. A pinned shape with no size wraps it. One
// with no pin keeps its spot. One pinned to a thing the view leaves out is not drawn there. One pinned to a thing that
// is gone is a problem. Each is said to a screen reader with its kind, its text and its pin.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readSketch } from '../src/sketch.ts';
import { sketchMarks, WRAP } from '../src/sketch-marks.ts';

const SKETCH = readSketch(`// graph: trip_ink · SKETCH ON trip
(a:Ink {x: 0, y: -40, pin: 'ann', points: '0 0 10 0 20 5'}),
(b:Shape {x: 0, y: 0, pin: 'team', shape: 'ellipse'}),
(c:Text {x: 300, y: 40, text: 'Ask Bob'}),
(d:Shape {x: -10, y: -10, w: 20, h: 20, pin: 'bob'})`).sketch;

/** A thing's box mark, `key` at (`x`, `y`), 100 by 40, and a group round it. */
const laidOut = (x, y) => [
  { id: 'g:team', kind: 'group', style: 'group', x: x - 20, y: y - 20, width: 300, height: 120, name: 'Team' },
  { id: 'n1', kind: 'box', style: 'thing', of: 'ann', x, y, width: 100, height: 40, name: 'Ann' },
  { id: 'n2', kind: 'box', style: 'thing', of: 'bob', x: x + 150, y, width: 100, height: 40, name: 'Bob' },
];

const byId = (pieces) => new Map(pieces.map((p) => [p.mark.id, p.mark]));

describe('a pinned drawing', () => {
  test('is placed from the centre of the thing it is pinned to, and moves with it when the layout moves', () => {
    const first = byId(sketchMarks(SKETCH, laidOut(0, 0)).pieces).get('sketch:a');
    const moved = byId(sketchMarks(SKETCH, laidOut(500, 300)).pieces).get('sketch:a');
    assert.deepEqual(first.points, [
      [50, -20],
      [60, -20],
      [70, -15],
    ]);
    assert.deepEqual(
      moved.points,
      first.points.map(([x, y]) => [x + 500, y + 300]),
    );
  });

  test('a shape pinned with no size wraps the group it is pinned to, standing off it', () => {
    const b = byId(sketchMarks(SKETCH, laidOut(0, 0)).pieces).get('sketch:b');
    assert.deepEqual([b.kind, b.shape], ['box', 'ellipse']);
    assert.deepEqual([b.x, b.y, b.width, b.height], [-20 - WRAP, -20 - WRAP, 300 + 2 * WRAP, 120 + 2 * WRAP]);
  });

  test('a shape pinned with a size keeps its size, from the centre of its thing', () => {
    const d = byId(sketchMarks(SKETCH, laidOut(0, 0)).pieces).get('sketch:d');
    assert.deepEqual([d.x, d.y, d.width, d.height], [190, 10, 20, 20]);
  });

  test('a drawing with no pin keeps its spot on the drawing, whatever the layout', () => {
    for (const at of [laidOut(0, 0), laidOut(900, 900)]) {
      const c = byId(sketchMarks(SKETCH, at).pieces).get('sketch:c');
      assert.deepEqual([c.kind, c.x, c.y, c.text], ['label', 300, 40, 'Ask Bob']);
    }
  });

  test('says which block it sits on in space', () => {
    const pins = new Map(sketchMarks(SKETCH, laidOut(0, 0)).pieces.map((p) => [p.mark.id, p.pin]));
    assert.deepEqual([pins.get('sketch:a'), pins.get('sketch:b'), pins.get('sketch:c')], ['n1', 'g:team', undefined]);
  });
});

describe('a drawing whose pin is not shown', () => {
  test('is not drawn in a view that leaves its thing out, and is named as hidden', () => {
    const view = laidOut(0, 0).filter((m) => m.of !== 'ann');
    const { pieces, hidden } = sketchMarks(SKETCH, view);
    assert.ok(!byId(pieces).has('sketch:a'));
    assert.deepEqual(hidden, ['a']);
  });

  test('pinned to a thing the graph does not hold, it is a problem with its fix', () => {
    const { problems } = readSketch(SKETCH_TEXT, new Set(['ann', 'team']));
    assert.deepEqual(
      problems.map((p) => [p.code, p.line]),
      [['GN906', 5]],
    );
    assert.match(problems[0].fix, /pin it to a thing of trip/);
  });
});

const SKETCH_TEXT = `// graph: trip_ink · SKETCH ON trip
(a:Ink {x: 0, y: -40, pin: 'ann', points: '0 0 10 0 20 5'}),
(b:Shape {x: 0, y: 0, pin: 'team', shape: 'ellipse'}),
(c:Text {x: 300, y: 40, text: 'Ask Bob'}),
(d:Shape {x: -10, y: -10, w: 20, h: 20, pin: 'bob'})`;

describe('a drawing said to a screen reader', () => {
  test('is a picture, said with its kind, its text and the name of what it is pinned to', () => {
    const marks = byId(sketchMarks(SKETCH, laidOut(0, 0)).pieces);
    for (const m of marks.values()) assert.equal(m.role, 'picture');
    assert.equal(marks.get('sketch:a').name, 'Freehand drawing, pinned to Ann');
    assert.equal(marks.get('sketch:b').name, 'Ellipse, pinned to Team');
    assert.equal(marks.get('sketch:c').name, 'Note: Ask Bob');
  });
});
