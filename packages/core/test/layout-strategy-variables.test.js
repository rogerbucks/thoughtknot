// Each layout strategy's variables (editor spec §68, layout_strategy_variables): layout-options.ts. Rounds, direction,
// shape and what is pinned are named once, each with a default. The style graph keeps them with a view saved as
// shown. The View menu sets them, and 2D and 3D read them by the same names.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { placeKept } from '../src/layout-glide.ts';
import {
  DEFAULT_LAYOUT_OPTIONS as ALONE,
  LAYOUT_CHOICES,
  SHOWN_LAYOUT_CHOICES,
} from '../src/layouts/layout-options.ts';
import { SHOWN_LAYOUT_KEYS, aspectOf, layoutOptions, roundsOf } from '../src/layouts/layout-options.ts';
import { packPlaced } from '../src/layouts/parts.ts';
import { DEFAULT_SETTINGS } from '../src/settings.ts';
import { spreadSpace } from '../src/space-spread.ts';
import { readStyle } from '../src/style.ts';
import { styleEdit } from '../src/style-edit.ts';
import { styledDrawing } from '../src/style-source.ts';
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

describe('the variables are named once, each with a default', () => {
  // proves: layout_strategy_variables
  test('the names, their words and their defaults, with a wrong one read as its default', () => {
    assert.deepEqual(Object.values(SHOWN_LAYOUT_KEYS), ['spacing', 'link_length', 'group_pull', 'rounds']);
    assert.deepEqual(Object.values(SHOWN_LAYOUT_CHOICES), ['layout_direction', 'shape', 'pinned', 'layout_strategy']);
    assert.deepEqual(LAYOUT_CHOICES, {
      direction: ['best', 'LR', 'TB'],
      shape: ['screen', 'wide', 'tall'],
      pinned: ['selected', 'middle', 'nothing'],
      strategy: ['auto', 'rows', 'spread'],
    });
    assert.deepEqual(layoutOptions(), ALONE);
    assert.deepEqual(
      layoutOptions({ rounds: 9, direction: 'up', shape: 'round', pinned: 'all' }),
      { ...ALONE, rounds: 4 },
      'a number kept in its range, a wrong word as its default',
    );
  });
});

describe('the style graph keeps them with a view saved as shown', () => {
  // proves: layout_strategy_variables
  test('they are read back, and a wrong word is a problem', () => {
    const { style, problems } = styled(
      "(w1:Shown {view: 'near', rounds: 2, layout_direction: 'TB', shape: 'wide', pinned: 'nothing'}),",
      "(w2:Shown {view: 'far', shape: 'round'})",
    );
    assert.deepEqual(
      problems.map((p) => [p.line, p.message]),
      [[3, 'shape must be screen, wide or tall']],
    );
    const near = { ...ALONE, rounds: 2, direction: 'TB', shape: 'wide', pinned: 'nothing' };
    assert.deepEqual(startingLayout(style, 'near'), near);
    assert.deepEqual(startingLayout(style, 'far'), ALONE);
  });

  // proves: layout_strategy_variables
  test('Save as shown writes them, and refuses a wrong word', () => {
    const note = ['# Trip', '', '```gql', TRIP, '```', ''].join('\n');
    const shown = { view: 'near', zoom: 1, x: 0, y: 0 };
    const r = styleEdit(note, 'trip', { shown: { ...shown, layout: { ...ALONE, rounds: 2, shape: 'tall' } } });
    assert.ok('note' in r, JSON.stringify(r));
    assert.match(r.note, /rounds: 2, layout_direction: 'best', shape: 'tall', pinned: 'selected'/);
    const bad = styleEdit(note, 'trip', { shown: { ...shown, layout: { ...ALONE, pinned: 'all' } } });
    assert.ok('refused' in bad && /pinned/.test(bad.refused), JSON.stringify(bad));
  });
});

describe('each variable takes effect', () => {
  // proves: layout_strategy_variables
  test('rounds scale a layout own count, never below one', () => {
    assert.equal(roundsOf(undefined, 8), 8);
    assert.equal(roundsOf({ rounds: 2 }, 8), 16);
    assert.equal(roundsOf({ rounds: 0.25 }, 2), 1);
  });

  // proves: layout_strategy_variables
  test('a wide shape packs the parts wider than tall, and a tall one taller', () => {
    assert.equal(aspectOf(undefined, 1.5), 1.5);
    assert.equal(aspectOf({ shape: 'wide' }, 1.5), 3);
    const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    const pieces = keys.map((k) => ({ spots: new Map([[k, [0, 0]]]), via: new Map(), boxes: [] }));
    const sizes = new Map(keys.map((k) => [k, [40, 40]]));
    const across = (shape) => {
      const at = [...packPlaced(pieces, sizes, 10, { shape }).spots.values()];
      const reach = (i) => Math.max(...at.map((p) => p[i])) - Math.min(...at.map((p) => p[i]));
      return reach(0) / Math.max(1, reach(1));
    };
    assert.ok(across('wide') > across('screen'), `${across('wide')} > ${across('screen')}`);
    assert.ok(across('tall') < across('screen'), `${across('tall')} < ${across('screen')}`);
  });

  // proves: layout_strategy_variables
  test('in space too, by the same name: a wide shape spreads the balls wider than tall', () => {
    const box = (key) => ({ id: `t:${key}`, kind: 'box', style: 's', of: key, x: 0, y: 0, width: 80, height: 30 });
    const link = (id, from, to) => ({ id, kind: 'link', style: 's', points: [], from, to });
    const keys = Array.from({ length: 24 }, (_, i) => `k${i}`);
    // a tree: each thing linked from the one at half its place
    const marks = [...keys.map(box), ...keys.slice(1).map((k, i) => link(`${i}`, `k${Math.floor(i / 2)}`, k))];
    const across = (shape) => {
      const { space } = spreadSpace(marks, undefined, false, false, { shape });
      return (space.most[0] - space.least[0]) / (space.most[1] - space.least[1]);
    };
    assert.ok(across('wide') > across('tall'), `${across('wide')} > ${across('tall')}`);
  });

  // proves: layout_strategy_variables
  test('a direction picked wins over the best fit, and the best fit leaves the style as it is', () => {
    const { style, reading } = styled("(n1:Nudge {word: 'direction', direction: 'LR'})");
    const drawing = styledDrawing(reading.graphs.get('trip'), style, reading.world.trip);
    const state = new ViewState(startingSwitches(DEFAULT_SETTINGS), startingLayout(style));
    assert.equal(state.folded(drawing).direction, drawing.direction);
    state.layout = { ...state.layout, direction: 'TB' };
    assert.equal(state.folded(drawing).direction, 'TB');
  });

  // proves: layout_strategy_variables
  test('what is pinned stays: the selected thing, the middle alone, or nothing', () => {
    const was = new Map([
      ['a', [0, 0]],
      ['b', [100, 0]],
    ]);
    const now = new Map([
      ['a', [50, 50]],
      ['b', [250, 50]],
    ]);
    assert.deepEqual(placeKept(was, now, 'a'), [-50, -50], 'the selected thing stays');
    assert.deepEqual(placeKept(was, now, 'a', 'selected'), [-50, -50]);
    assert.notDeepEqual(placeKept(was, now, 'a', 'middle'), [-50, -50], 'the middle, not the selected thing');
    assert.equal(placeKept(was, now, 'a', 'nothing'), null);
  });
});
