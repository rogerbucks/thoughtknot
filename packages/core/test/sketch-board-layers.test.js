// Board layers shown over a graph's views (editor spec ES§70, board_layers_over). A layer marked `over` is drawn over
// every view of the board's graph. An item linked to a thing follows it in any layout, flat or in space. An item
// with no link lies on the plane. Nothing is written, and a hidden layer is not shown.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readBoard } from '../src/board.ts';
import { boardEdit } from '../src/board-edit.ts';
import { PALETTES } from '../src/palette.ts';
import { layerDrawings, layersOver, UNDER, withLayers } from '../src/sketch-board-layers.ts';
import { sketchInSpace, sketchMarks, sketchSvg, WRAP } from '../src/sketch-marks.ts';
import { spaceOf } from '../src/space-view.ts';

const BOARD = `// graph: ideas · BOARD ON trip
(notes:Layer {name: 'Notes', order: 1, over: true}),
(draft:Layer {name: 'Draft', order: 2}),
(a:Sticky {x: 0, y: 0, text: 'Ask Ann first', graph: 'ann', style: 'red', in_layer: 'notes'}),
(ring:Shape {x: 0, y: 0, graph: 'bob', in_layer: 'notes'}),
(free:Sticky {x: 400, y: 300, text: 'Budget?', in_layer: 'notes'}),
(ink:Ink {x: 600, y: 300, points: '0 0 10 4 20 0', in_layer: 'notes'}),
(d:Sticky {x: 0, y: 500, text: 'Not shown', in_layer: 'draft'}),
(loose:Sticky {x: 0, y: 700, text: 'In no layer'})`;

const NOTE = `# Trip

\`\`\`gql
// graph: trip
(ann:Person), (bob:Person), (ann)-[:KNOWS]->(bob)
\`\`\`

\`\`\`gql
${BOARD}
\`\`\`
`;

/** The things' box marks, Ann at (`x`, `y`) and Bob beside her. */
const laidOut = (x, y) => [
  { id: 'n1', kind: 'box', style: 'thing', of: 'ann', x, y, width: 100, height: 40, name: 'Ann' },
  { id: 'n2', kind: 'box', style: 'thing', of: 'bob', x: x + 200, y, width: 100, height: 40, name: 'Bob' },
];
const byId = (pieces) => new Map(pieces.map((p) => [p.mark.id, p.mark]));

describe('a board layer shown over the views', () => {
  // proves: board_layers_over
  test('gives the items of the layers marked over, and no others: not another layer’s, not the loose ones', () => {
    const items = layerDrawings(readBoard(BOARD).board);
    assert.deepEqual(
      items.map((i) => [i.id, i.kind, i.pin]),
      [
        ['ideas.a.words', 'Text', 'ann'],
        ['ideas.ring', 'Shape', 'bob'],
        ['ideas.free', 'Shape', undefined],
        ['ideas.free.words', 'Text', undefined],
        ['ideas.ink', 'Ink', undefined],
      ],
    );
    assert.equal(items[0].style, 'red', 'in the item’s own hue');
  });

  // proves: board_layers_over
  test('is found for its graph from the note, and for no other graph', () => {
    assert.equal(layersOver(NOTE, 'trip').items.length, 5);
    assert.equal(layersOver(NOTE, 'elsewhere'), null);
  });

  // proves: board_layers_over
  test('pins a linked item to its thing, so it moves with the thing when the layout moves', () => {
    const over = layersOver(NOTE, 'trip');
    const first = byId(sketchMarks(over, laidOut(0, 0)).pieces);
    const moved = byId(sketchMarks(over, laidOut(500, 300)).pieces);
    const words = first.get('sketch:ideas.a.words');
    assert.equal(words.text, 'Ask Ann first');
    assert.deepEqual([words.x, words.y], [50, 20 + UNDER], 'under the middle of Ann');
    const after = moved.get('sketch:ideas.a.words');
    assert.deepEqual([after.x, after.y], [550, 320 + UNDER]);
    const ring = first.get('sketch:ideas.ring');
    assert.deepEqual([ring.x, ring.y, ring.width], [200 - WRAP, -WRAP, 100 + 2 * WRAP], 'a shape goes round its thing');
  });

  // proves: board_layers_over
  test('lays an item with no link on the plane at its place on the board, wherever the things go', () => {
    const over = layersOver(NOTE, 'trip');
    const first = byId(sketchMarks(over, laidOut(0, 0)).pieces).get('sketch:ideas.free');
    const moved = byId(sketchMarks(over, laidOut(500, 300)).pieces).get('sketch:ideas.free');
    assert.deepEqual([first.x, first.y], [400, 300]);
    assert.deepEqual(moved, first);
    const ink = byId(sketchMarks(over, laidOut(0, 0)).pieces).get('sketch:ideas.ink');
    assert.deepEqual(ink.points[1], [610, 304]);
  });

  // proves: board_layers_over
  test('is not drawn where the view leaves its thing out', () => {
    const { hidden } = sketchMarks(layersOver(NOTE, 'trip'), laidOut(0, 0).slice(0, 1));
    assert.deepEqual(hidden, ['ideas.ring']);
  });

  // proves: board_layers_over
  test('is lifted in 2.5D and 3D: a linked item onto the top of its thing’s block, a free one onto the ground', () => {
    const marks = laidOut(0, 0);
    const space = spaceOf(marks, { by: 'group' });
    const { pieces } = sketchMarks(layersOver(NOTE, 'trip'), marks);
    const lifted = sketchInSpace(pieces, space);
    const block = space.blocks.find((b) => b.id === 'n1');
    const words = lifted.labels.find((l) => l.id === 'sketch:ideas.a.words');
    assert.ok(words.at[2] > block.floor + block.tall, 'above Ann’s block');
    const free = lifted.lines.find((l) => l.id === 'sketch:ideas.free');
    for (const p of free.points) assert.ok(p[2] >= 0 && p[2] < 5, 'on the ground');
  });

  // proves: board_layers_over
  test('is drawn in the flat picture with the drawings, each said by its words', () => {
    const { pieces } = sketchMarks(layersOver(NOTE, 'trip'), laidOut(0, 0));
    const svg = sketchSvg(pieces, PALETTES.light);
    assert.match(svg, /data-sketch="ideas\.free"/);
    assert.match(svg, /Ask Ann first/);
  });

  // proves: board_layers_over
  test('is not shown once its layer is hidden, or no longer marked over', () => {
    const edit = (change) => {
      const r = boardEdit(BOARD, change);
      assert.ok('text' in r, r.refused);
      return NOTE.replace(BOARD, r.text);
    };
    assert.equal(layersOver(edit({ kind: 'layer-set', id: 'notes', hidden: true }), 'trip'), null);
    assert.equal(layersOver(edit({ kind: 'layer-set', id: 'notes', over: false }), 'trip'), null);
    const both = layersOver(edit({ kind: 'layer-set', id: 'draft', over: true }), 'trip');
    assert.equal(both.items.at(-1).id, 'ideas.d.words', 'a higher layer is drawn later, so on top');
  });

  // proves: board_layers_over
  test('joins the drawings of the graph without changing them, and is all there is when there are none', () => {
    const over = layersOver(NOTE, 'trip');
    const sketch = {
      name: 'trip_ink',
      on: 'trip',
      items: [{ id: 'd1', kind: 'Text', x: 0, y: 0, text: 'hi', more: {} }],
    };
    const all = withLayers(sketch, over);
    assert.equal(all.name, 'trip_ink');
    assert.equal(all.items.length, 6);
    assert.equal(all.items.at(-1).id, 'd1', 'the person’s own drawings stay on top');
    assert.equal(sketch.items.length, 1);
    assert.equal(withLayers(null, over), over);
    assert.equal(withLayers(sketch, null), sketch);
    assert.equal(withLayers(null, null), null);
  });
});
