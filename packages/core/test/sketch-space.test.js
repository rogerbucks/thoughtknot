// Drawings in every view (editor spec §70, sketch_every_view). They become the shared drawing marks, so every painter
// draws them alike. The SVG layer lays them over a 2D drawing. In 2.5D and 3D they lie on the top of the block they
// are pinned to, or on the ground. No view has a fork of its own.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { drawMarksOf } from '../src/drawing-marks.ts';
import { PALETTES } from '../src/palette.ts';
import { readSketch } from '../src/sketch.ts';
import { drawnMarks, sketchInSpace, sketchMarks, sketchSvg, SKETCH_Z } from '../src/sketch-marks.ts';
import { spaceOf } from '../src/space-view.ts';

const SKETCH = readSketch(`// graph: trip_ink · SKETCH ON trip
(a:Ink {x: 0, y: -40, pin: 'ann', style: 'red', points: '0 0 10 0 20 5'}),
(b:Shape {x: 0, y: 0, pin: 'team', shape: 'ellipse'}),
(c:Text {x: 300, y: 40, text: 'Ask <Bob> & co'}),
(d:Shape {x: 100, y: 100, shape: 'arrow', points: '0 0 60 0'}),
(e:Shape {x: 400, y: 100, w: 50, h: 30})`).sketch;

const MARKS = [
  { id: 'g:team', kind: 'group', style: 'group', x: 40, y: 40, width: 300, height: 120, name: 'Team' },
  { id: 'n1', kind: 'box', style: 'thing', of: 'ann', group: 'g:team', x: 30, y: 30, width: 100, height: 40 },
];

const { pieces } = sketchMarks(SKETCH, MARKS);

describe('drawings as shared marks', () => {
  test('are marks every painter takes: each one passes the marks check, ids its own', () => {
    const checked = drawMarksOf(
      pieces.map((p) => p.mark),
      { width: 2000, height: 2000 },
    );
    assert.ok(Array.isArray(checked), checked);
    assert.equal(checked.length, pieces.length);
  });

  test('are drawn over the graph’s own marks, in its hue where it has one', () => {
    for (const { mark } of pieces) assert.equal(mark.z, SKETCH_Z);
    const ink = pieces.find((p) => p.mark.id === 'sketch:a').mark;
    assert.equal(ink.style, 'sketch.red');
    assert.equal(pieces.find((p) => p.mark.id === 'sketch:e').mark.style, 'sketch');
  });

  test('a stroke is a line with no arrowhead, and an arrow has its head at its end', () => {
    const ink = pieces.find((p) => p.mark.id === 'sketch:a').mark;
    assert.deepEqual([ink.kind, ink.headless], ['link', true]);
    const head = pieces.find((p) => p.mark.id === 'sketch:d:head').mark;
    assert.deepEqual([head.kind, head.x, head.y, head.angle], ['arrowhead', 160, 100, 0]);
  });
});

describe('drawings in 2D', () => {
  const svg = sketchSvg(pieces, PALETTES.light);

  test('are one SVG layer, each drawing a part a host can tell was tapped, with its title', () => {
    assert.match(svg, /^<g class="tk-sketch"/);
    for (const id of ['a', 'b', 'c', 'd', 'e']) assert.match(svg, new RegExp(`data-sketch="${id}"`));
    assert.match(svg, /<title>Freehand drawing, pinned to ann<\/title>/);
  });

  test('draws each kind: a stroke, an ellipse, a box, an arrow and its head, and a note', () => {
    assert.match(svg, /<polyline/);
    assert.match(svg, /<ellipse/);
    assert.match(svg, /<rect/);
    assert.match(svg, /data-sketch="d"[^]*<path d="M160 100/);
  });

  test('escapes every word, and uses the palette’s colours only', () => {
    assert.match(svg, /Ask &lt;Bob&gt; &amp; co/);
    assert.doesNotMatch(svg, /<Bob>/);
    assert.ok(svg.includes(PALETTES.light.text));
  });
});

describe('drawings in 2.5D and 3D', () => {
  const space = spaceOf(MARKS, { by: 'group' });
  const lifted = sketchInSpace(pieces, space);
  const top = (id) => {
    const b = space.blocks.find((x) => x.id === id);
    return b.floor + b.tall;
  };

  test('a drawing pinned to a thing lies just above the top of its block', () => {
    const ink = lifted.lines.find((l) => l.id === 'sketch:a');
    for (const p of ink.points) assert.ok(p[2] > top('n1') && p[2] < top('n1') + 5, String(p));
  });

  test('a shape pinned to a group lies on the group’s slab, and goes round it', () => {
    const ring = lifted.lines.find((l) => l.id === 'sketch:b');
    assert.ok(ring.points.length > 8);
    for (const p of ring.points) assert.ok(p[2] > top('g:team') && p[2] < top('g:team') + 5);
    assert.deepEqual(ring.points[0], ring.points[ring.points.length - 1], 'closed');
  });

  test('a drawing with no pin lies on the ground, the page’s down being the space’s back', () => {
    const box = lifted.lines.find((l) => l.id === 'sketch:e');
    for (const p of box.points) assert.ok(p[2] >= 0 && p[2] < 5);
    assert.deepEqual(box.points[0].slice(0, 2), [400, -100]);
    const note = lifted.labels.find((l) => l.id === 'sketch:c');
    assert.deepEqual(note.at.slice(0, 2), [300, -40]);
  });

  test('an arrow keeps its head, pointing the way it points on the page', () => {
    const head = lifted.arrows.find((a) => a.id === 'sketch:d:head');
    assert.deepEqual(head.tip.slice(0, 2), [160, -100]);
    assert.ok(head.back[0] < head.tip[0]);
  });
});

describe('drawings placed on a drawing as Graphviz wrote it', () => {
  const SVG = `<svg width="300pt" height="200pt" viewBox="0 0 300 200"><g id="graph0" class="graph" transform="scale(1 1) rotate(0) translate(4 196)">
<g id="clust1" class="cluster"><title>cluster_team</title><polygon points="0,-190 280,-190 280,-10 0,-10 0,-190"/></g>
<g id="node1" class="node"><title>ann</title><polygon points="20,-150 120,-150 120,-110 20,-110 20,-150"/></g>
</g></svg>`;

  test('reads each box by its thing’s key, and each group by its title, in the viewBox’s units', () => {
    const marks = drawnMarks(SVG, ['ann']);
    const ann = marks.find((m) => m.of === 'ann');
    assert.deepEqual([ann.x, ann.y, ann.width, ann.height], [24, 46, 100, 40]);
    const team = marks.find((m) => m.id === 'g:cluster_team');
    assert.deepEqual([team.x, team.y, team.width, team.height], [4, 6, 280, 180]);
  });

  test('a drawing pinned to a thing is placed from its box as drawn', () => {
    const sketch = readSketch(`// graph: t_ink · SKETCH ON t\n(a:Text {x: 0, y: 0, pin: 'ann', text: 'hi'})`).sketch;
    const [note] = sketchMarks(sketch, drawnMarks(SVG, ['ann'])).pieces;
    assert.deepEqual([note.mark.x, note.mark.y], [74, 66]);
  });
});

describe('drawings in a space that spreads its things afresh', () => {
  test('a pinned drawing follows its block to where it stands now', () => {
    const space = spaceOf(MARKS, { by: 'group' });
    const moved = { ...space, blocks: space.blocks.map((b) => (b.id === 'n1' ? { ...b, x: b.x + 500 } : b)) };
    const before = sketchInSpace(pieces, space).lines.find((l) => l.id === 'sketch:a');
    const after = sketchInSpace(pieces, moved).lines.find((l) => l.id === 'sketch:a');
    assert.deepEqual(
      after.points.map((p) => p[0]),
      before.points.map((p) => p[0] + 500),
    );
  });
});
