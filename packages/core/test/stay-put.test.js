// Things stay put (editor spec §68, things_stay_put): a thing already on screen stays where it is. More shows by
// zooming in, and nothing is laid out again unless the person asks.
// - The check fails on a thing shown that moved, and lets pass one gone, one new and one asked to move.
// - Every view type draws the same graph twice with every thing in the same place.
// - An exploration opened one step further moves nothing it already showed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertStaysPut, movedThings, spotsOfMarks } from './stay-put-fixtures.js';
import { pluginRegistry } from '../src/plugins.ts';
import { coreDiagramType, coreDiagrams } from '../src/core-diagrams.ts';
import { loadEngine } from '../src/engine.ts';
import { VIEW_TYPES } from '../src/view-types/view-types.ts';
import { ExploreMap } from '../src/explore-map.ts';
import { EXPLORE_SHAPES, exploreSpots } from '../src/layouts/explore-shapes.ts';

const engine = await loadEngine();
const thing = (key, kind = 'Person') => ({ key, text: key.toUpperCase(), kinds: [kind] });

// proves: things_stay_put
test('the check fails on a shown thing that moved, and lets a gone, a new or an asked-for one pass', () => {
  const before = new Map([
    ['ann', [0, 0]],
    ['bob', { x: 10, y: 10, width: 20, height: 10 }],
    ['cy', [5, 5, 5]],
  ]);
  const after = new Map([
    ['ann', [0.2, 0]],
    ['bob', { x: 40, y: 10, width: 20, height: 10 }],
    ['dee', [100, 100]],
  ]);
  assert.deepEqual(
    movedThings(before, after).map((m) => [m.key, m.from, m.to]),
    [['bob', [20, 15], [50, 15]]],
    'only bob moved: ann shifted by rounding, cy is gone and dee is new',
  );
  assert.throws(() => assertStaysPut(before, after, 'a drawing'), /bob 20,15 → 50,15/);
  assert.doesNotThrow(() => assertStaysPut(before, after, 'a drawing', { asked: ['bob'] }), 'a move asked for');
});

test('every view type draws the same graph again with each thing where it was', async () => {
  const things = [thing('hub'), ...Array.from({ length: 12 }, (_, i) => thing(`t${i}`, i % 2 ? 'Team' : 'Person'))];
  const links = things.slice(1).map((t, i) => ({ from: i < 4 ? 'hub' : `t${i - 4}`, type: 'KNOWS', to: t.key }));
  const shape = { things, links };
  const r = pluginRegistry({ timeLimit: Infinity });
  r.register(coreDiagrams(engine));
  for (const view of VIEW_TYPES) {
    const draw = () => r.diagramMarks(coreDiagramType(view), shape, { width: 600, height: 400 });
    const [first, again] = [await draw(), await draw()];
    assert.ok(first.ok && again.ok, `${view}: ${first.message ?? again.message}`);
    assertStaysPut(spotsOfMarks(first.value), spotsOfMarks(again.value), `${view} drawn again`);
  }
});

test('an exploration opened one step further moves nothing it showed, in every shape and space', () => {
  const box = (key) => ({ key, kind: 'Thing', text: key });
  const link = (from, to) => ({ from, to, type: 'Thing', reading: 'links' });
  const mind = {
    graph: 'G',
    boxes: ['idea', 'a', 'b', 'c', 'a1', 'a2'].map(box),
    links: [link('idea', 'a'), link('idea', 'b'), link('idea', 'c'), link('a', 'a1'), link('a', 'a2')],
    estimates: [],
  };
  for (const shape of EXPLORE_SHAPES)
    for (const space of ['2d', '2.5d', '3d']) {
      const m = new ExploreMap(mind, 'idea');
      m.open('idea');
      const before = exploreSpots(m, shape, space);
      m.open('a');
      assertStaysPut(before, exploreSpots(m, shape, space, { previous: before }), `${shape} ${space}`);
    }
});
