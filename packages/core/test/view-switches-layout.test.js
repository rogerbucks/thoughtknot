// How the layout spaces a graph, from the View menu (editor spec §53, layout_saved_with_view): view-switches.ts. Its
// spacing, link length and group pull are a card's own until a view is saved as shown. Then its Shown keeps them, and
// the view opens spaced so again, flat and in space.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { DEFAULT_SETTINGS } from '../src/settings.ts';
import { spreadSpace } from '../src/space-spread.ts';
import { readStyle } from '../src/style.ts';
import { styleEdit } from '../src/style-edit.ts';
import { styledDrawing } from '../src/style-source.ts';
import { DEFAULT_LAYOUT_OPTIONS as ALONE } from '../src/layouts/layout-options.ts';
import { ViewState, startingLayout, startingSwitches } from '../src/view-switches.ts';

const TRIP = `// graph: trip · SOURCE
(home:Place {name: 'Home'}),
(park:Place {name: 'The park'}),
(home)-[:NEAR]->(park)`;

/** The style of graph trip from a style block holding these lines, and its problems. */
const styled = (...lines) => {
  const texts = [TRIP, ['// graph: trip_style · STYLE trip', ...lines].join('\n')];
  const reading = readNote(texts);
  return { ...readStyle(texts, 'trip', reading), reading };
};
const said = (problems) => problems.map((p) => [p.line, p.message, p.fix]);

describe('a view saved as shown keeps how its layout was spaced', () => {
  // proves: layout_saved_with_view
  test('its spacing, link length and group pull are read back, and one out of range is a problem', () => {
    const { style, problems } = styled(
      "(w1:Shown {view: 'near', zoom: 1, spacing: 2, link_length: 0.5, group_pull: 0.8}),",
      "(w2:Shown {view: 'far', spacing: 9})",
    );
    assert.deepEqual(said(problems), [
      [3, 'spacing must be a number from 0.25 to 4', 'write spacing: 1 for the layout as it lays out alone'],
    ]);
    assert.deepEqual(style.shown.get('near').layout, { spacing: 2, linkLength: 0.5, groupPull: 0.8 });
    assert.deepEqual(startingLayout(style, 'near'), { ...ALONE, spacing: 2, linkLength: 0.5, groupPull: 0.8 });
    assert.deepEqual(startingLayout(style, 'far'), ALONE, 'as alone');
    assert.deepEqual(startingLayout(style), ALONE, 'the graph itself, as alone');
  });

  // proves: layout_saved_with_view
  test('Save as shown writes them only when they differ from alone, and refuses one out of range', () => {
    const note = ['# Trip', '', '```gql', TRIP, '```', ''].join('\n');
    const shown = { view: 'near', zoom: 1, x: 0, y: 0 };
    const r = styleEdit(note, 'trip', { shown: { ...shown, layout: { spacing: 2, linkLength: 1, groupPull: 0.5 } } });
    assert.ok('note' in r, JSON.stringify(r));
    assert.match(
      r.note,
      /\(shown_1:Shown \{view: 'near', zoom: 1, x: 0, y: 0, spacing: 2, link_length: 1, group_pull: 0.5\}\)/,
    );
    const plain = styleEdit(note, 'trip', {
      shown: { ...shown, layout: { spacing: 1, linkLength: 1, groupPull: 0.5 } },
    });
    assert.doesNotMatch(plain.note, /spacing/, 'as alone, nothing is written');
    const bad = styleEdit(note, 'trip', { shown: { ...shown, layout: { spacing: 1, linkLength: 9, groupPull: 0.5 } } });
    assert.deepEqual(bad, { refused: 'link_length must be a number from 0.25 to 4' });
  });
});

describe('a card spaced from the View menu', () => {
  // proves: layout_saved_with_view
  test('lays its drawing out with those options, and with none while they are as alone', () => {
    const { style, reading } = styled("(n1:Nudge {word: 'direction', direction: 'LR'})");
    const drawing = styledDrawing(reading.graphs.get('trip'), style, reading.world.trip);
    const state = new ViewState(startingSwitches(DEFAULT_SETTINGS), startingLayout(style));
    assert.equal(state.folded(drawing).layoutOptions, undefined);
    state.layout = { ...state.layout, spacing: 2 };
    assert.deepEqual(state.folded(drawing).layoutOptions, { ...ALONE, spacing: 2 });
  });

  // proves: layout_saved_with_view
  test('in space too: a longer link length spreads the balls further apart', () => {
    const box = (key) => ({ id: `t:${key}`, kind: 'box', style: 's', of: key, x: 0, y: 0, width: 80, height: 30 });
    const link = (id, from, to) => ({
      id,
      kind: 'link',
      style: 's',
      points: [
        [0, 0],
        [1, 1],
      ],
      from,
      to,
    });
    const marks = [...['a', 'b', 'c', 'd'].map(box), link('1', 'a', 'b'), link('2', 'b', 'c'), link('3', 'c', 'd')];
    const reach = (space) => Math.hypot(space.most[0] - space.least[0], space.most[1] - space.least[1]);
    const near = reach(spreadSpace(marks).space),
      far = reach(spreadSpace(marks, undefined, false, false, { linkLength: 3 }).space);
    assert.ok(far > near * 1.5, `${near} -> ${far}`);
  });
});
