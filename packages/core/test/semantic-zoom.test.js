// Semantic zoom (editor spec §68, projection_semantic_zoom): semantic-zoom.ts, with the ladder of detail it steps.
// Far out each group is a box with its count, nearer its things show, nearest their properties too. How near is told by
// how many things are on screen. It steps only the way the person zooms, and only past a margin, so it never flickers.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SEMANTIC_MARGIN, rungFor, semanticStep, thingsSeen } from '../src/semantic-zoom.ts';
import { readNote } from '../src/drawing.ts';
import { readStyle } from '../src/style.ts';
import { styledDrawing } from '../src/style-source.ts';
import { renderFor } from '../src/render-choice.ts';
import { ViewState } from '../src/view-switches.ts';
import { lensOf } from '../src/lenses.ts';

describe('how near is told by the things on screen (projection_semantic_zoom)', () => {
  // proves: projection_semantic_zoom
  test('the things on screen are as many as fit at the zoom, and never more than there are', () => {
    const screen = { width: 1000, height: 800 };
    assert.equal(thingsSeen(300, 1, screen), 40, 'a thing takes 200 × 100 at natural size');
    assert.equal(thingsSeen(300, 0.5, screen), 160, 'zoomed out by half, four times as many');
    assert.equal(thingsSeen(30, 0.5, screen), 30);
    assert.equal(thingsSeen(12, 0, screen), 12, 'nothing drawn yet');
  });

  // proves: projection_semantic_zoom
  test('far out the groups, nearer the things, nearer still every link apart, nearest the properties', () => {
    assert.deepEqual([500, 81, 80, 26, 25, 13, 12, 1].map(rungFor), [
      'overview',
      'overview',
      'groups',
      'groups',
      'all',
      'all',
      'properties',
      'properties',
    ]);
  });

  // proves: projection_semantic_zoom
  test('zooming in only adds detail and zooming out only takes it away, each past a margin', () => {
    assert.equal(semanticStep(60, 'overview', 1), 'groups', 'well past the edge: in to the things');
    assert.equal(semanticStep(79, 'overview', 1), 'overview', 'only just past it: held');
    assert.equal(semanticStep(500, 'groups', 1), 'groups', 'zoomed in never takes detail away');
    assert.equal(semanticStep(90, 'groups', -1), 'groups', 'only just past the edge out: held');
    assert.equal(semanticStep(80 * SEMANTIC_MARGIN + 1, 'groups', -1), 'overview');
    assert.equal(semanticStep(3, 'groups', -1), 'groups', 'zoomed out never adds detail');
    assert.equal(semanticStep(3, 'groups', 1), 'properties', 'a big zoom in steps as far as it reaches');
    assert.equal(semanticStep(79, 'properties', 0), 'groups', 'just picked: the rung that fits, with no margin');
  });
});

describe('the rungs are drawn as their own pictures (projection_semantic_zoom)', () => {
  const DATA = `// graph: town
(home:Place {name: 'Home', rooms: 4, open: 'always'}),
(park:Place {name: 'The park', free: TRUE}),
(gate:Place {name: 'Gate'}),
(home)-[:NEAR]->(park)`;
  const drawn = (...lines) => {
    const texts = [DATA, ['// graph: town_style · STYLE town', ...lines].join('\n')];
    const reading = readNote(texts),
      { style, problems } = readStyle(texts, 'town', reading);
    assert.deepEqual(problems, []);
    return { style, drawing: styledDrawing(reading.graphs.get('town'), style, reading.world.town) };
  };
  const off = { labels: true, hubs: false, groups: false, merge: false, engine: false, lanes: true };

  // proves: projection_semantic_zoom
  test('zoomed nearest, each thing shows every property it has, its name left to its text', () => {
    const { drawing } = drawn("(s1:Show {property: 'rooms', kind: 'Place'})");
    assert.deepEqual(drawing.everyProperty.boxes, [
      [
        'home',
        [
          ['rooms', '4'],
          ['open', 'always'],
        ],
      ],
      ['park', [['free', 'true']]],
    ]);
    const state = new ViewState(off);
    assert.deepEqual(state.folded(drawing).inline, drawing.inline, 'until zoomed nearest, the style says');
    assert.equal(state.toRung('properties'), true, 'laid out again');
    assert.deepEqual([state.rung, state.detail, state.things], ['properties', 'all', 3]);
    assert.deepEqual(state.folded(drawing).inline.boxes, drawing.everyProperty.boxes);
    assert.equal(state.toRung('properties'), false, 'already there');
    assert.equal(state.toRung('all'), true, 'zoomed out a step: the properties go');
    assert.deepEqual(state.folded(drawing).inline, drawing.inline);
    assert.equal(state.toRung('overview'), true);
    assert.deepEqual([state.rung, state.switches.groups, state.switches.merge], ['overview', true, true]);
  });

  // proves: projection_semantic_zoom
  test('a Render line picks semantic zoom; it bends nothing a view drew', () => {
    const { style } = drawn("(r1:Render {lens: 'semantic'})");
    assert.equal(renderFor(style).lens, 'semantic');
    assert.equal(lensOf('semantic', [0, 0], 10), null);
  });
});
