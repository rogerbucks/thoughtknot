// What Treemap, Containment, Block and Grid draw round their things on the new stage (editor spec §73,
// render_every_type): render/render-backdrop.ts. Tiles take their thing's colour, a thing's own name is left to the
// stage, and words too small to read are not drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backdropOf } from '../src/render/render-backdrop.ts';
import { LIGHT } from '../src/render/render-look.ts';
import { laidOf } from '../src/render/render-laid.ts';
import { sceneOf } from '../src/render/render-scene.ts';

const view = (scale) => ({ x: 0, y: 0, scale, w: 800, h: 600 });
const marks = [
  { kind: 'box', id: 'a', style: 'thing', of: 'A', role: 'thing', x: 10, y: 10, width: 100, height: 50 },
  { kind: 'group', id: 'g', style: 'group', x: 0, y: 0, width: 300, height: 200 },
  { kind: 'label', id: 'la', style: 'text', x: 20, y: 20, text: 'Thing A', size: 12, anchor: 'start' },
  { kind: 'label', id: 'lg', style: 'text', x: 5, y: 5, text: 'Work', size: 12, anchor: 'start' },
  {
    kind: 'link',
    id: 'l',
    style: 'link',
    from: 'A',
    to: 'B',
    points: [
      [0, 0],
      [10, 10],
    ],
  },
];
const backdrop = { marks, names: new Set(['Thing A']) };

test("tiles take their thing's colour, groups the paper, and links their start's colour", () => {
  const [m] = backdropOf(backdrop, view(1), new Map([['A', '#3366cc']]), LIGHT);
  assert.equal(m.tiles.length, 2);
  assert.equal(m.tiles[0].edge, '#3366cc');
  assert.equal(m.tiles[1].fill, LIGHT.paper);
  assert.equal(m.lines[0].colour, '#3366cc');
});

test("a thing's own name is left to the stage; other words show once big enough to read", () => {
  assert.deepEqual(
    backdropOf(backdrop, view(1), new Map(), LIGHT)[0].words.map((w) => w.text),
    ['Work'],
  );
  assert.deepEqual(backdropOf(backdrop, view(0.5), new Map(), LIGHT)[0].words, []);
});

test('a tiled type keeps its own drawing as the backdrop, with no stage roads or patches', () => {
  const thing = (key) => ({ key, text: `Thing ${key}`, kinds: ['Item'], texts: new Map() });
  const shape = { things: ['A', 'B', 'C'].map(thing), links: [{ from: 'A', to: 'B', type: 'RELATES' }] };
  const laid = laidOf('treemap', shape, sceneOf(shape));
  assert.ok(laid.scene.backdrop.marks.length > 0);
  assert.deepEqual(laid.scene.roads, [[]]);
  assert.equal(laid.scene.areas, undefined);
  assert.equal(laid.spots.size, 3);
});

test('a curved link keeps its curve', () => {
  const curve = {
    kind: 'link',
    id: 'c',
    style: 'link',
    curve: true,
    points: [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
    ],
  };
  const [m] = backdropOf({ marks: [curve], names: new Set() }, view(1), new Map(), LIGHT);
  assert.equal(m.lines[0].curve, true);
});
