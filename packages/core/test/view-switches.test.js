// The View menu's switches (editor spec §25), each on or off (view_switches). They are labels by zoom, busy hubs
// folded, groups folded, parallel links merged and the new layout engine (layout_own_engine). The settings page alone
// offers the engine (view_switch_hints). They start from the
// plugin's settings, a style graph's merging, and a view's switches saved as shown (view_switch_defaults). A card's
// state of them folds, opens and saves, changing only the drawing (view_switch_view_only, untangle_data_untouched).
import { afterEach, test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { DEFAULT_SETTINGS } from '../src/settings.ts';
import { readStyle } from '../src/style.ts';
import { styledDrawing } from '../src/style-source.ts';
import {
  LABEL_SCALE,
  SWITCH_SETTINGS,
  VIEW_SWITCHES,
  ViewState,
  labelsHidden,
  startingSwitches,
  switchName,
} from '../src/view-switches.ts';
import { isPseudoWord } from '../src/pseudo-words.ts';
import { setLanguage, SOURCE_LANGUAGE } from '../src/words.ts';

afterEach(() => setLanguage(SOURCE_LANGUAGE));

const star = (n) =>
  [
    '// graph: g',
    "(hub:Hub {name: 'Hub'}),",
    ...Array.from({ length: n }, (_, i) => `(leaf${i + 1}:Leaf {name: 'Leaf ${i + 1}'}),`),
    "(ann:Person {name: 'Ann'}),",
    "(bob:Person {name: 'Bob'}),",
    ...Array.from({ length: n }, (_, i) => `(hub)-[:HAS]->(leaf${i + 1}),`),
    '(ann)-[:KNOWS]->(bob)',
  ].join('\n');
const GROUPED = `// graph: g_style · STYLE g
(n1:Nudge {word: 'group', thing: 'ann', group: 'Friends'}),
(n2:Nudge {word: 'group', thing: 'bob', group: 'Friends'})`;

/** The drawing of graph g as its style draws it, with its style. */
function styledOf(...texts) {
  const reading = readNote(texts);
  const { style } = readStyle(texts, 'g', reading);
  return { drawing: styledDrawing(reading.graphs.get('g'), style, reading.world.g), style, reading };
}

describe('the switches', () => {
  test('are labels by zoom, busy hubs folded, groups folded, parallel links merged and the new engine, in that order', () => {
    assert.deepEqual(VIEW_SWITCHES, ['labels', 'hubs', 'groups', 'merge', 'engine']);
    assert.deepEqual(
      VIEW_SWITCHES.map((s) => switchName(s)),
      [
        'Hide labels too small to read',
        'Fold busy things',
        'Fold groups',
        'Bundle links between groups',
        'Lay out with ThoughtKnot',
      ],
    );
  });

  test('start from the settings: labels by zoom on, busy hubs folded off, groups folded off, links merged off, our engine on', () => {
    // every thing starts open, its links drawn; the person folds what they want (Roger, 24 Oct 2026)
    assert.deepEqual(startingSwitches(DEFAULT_SETTINGS), {
      labels: true,
      hubs: false,
      groups: false,
      merge: false,
      engine: true,
    });
    const changed = { ...DEFAULT_SETTINGS, labelsByZoom: 'off', foldGroups: 'on', foldHubs: 'on' };
    assert.deepEqual(startingSwitches(changed), {
      labels: false,
      hubs: true,
      groups: true,
      merge: false,
      engine: true,
    });
    assert.deepEqual(SWITCH_SETTINGS, {
      labels: 'labelsByZoom',
      hubs: 'foldHubs',
      groups: 'foldGroups',
      merge: 'mergeLinks',
      engine: 'ownLayout',
    });
  });

  test('links merged starts as the style graph merges them, and a view starts as it was saved as shown', () => {
    const { style } = styledOf(
      star(2),
      `${GROUPED},\n(r1:Links {merge: 'on'}),\n(w1:Shown {view: 'near', labels: 'off', merge: 'off', groups: 'on'})`,
    );
    assert.deepEqual(startingSwitches(DEFAULT_SETTINGS, style), {
      labels: true,
      hubs: false,
      groups: false,
      merge: true,
      engine: true,
    });
    assert.deepEqual(startingSwitches(DEFAULT_SETTINGS, style, 'near'), {
      labels: false,
      hubs: false,
      groups: true,
      merge: false,
      engine: true,
    });
  });
});

describe('labels by zoom', () => {
  test('hide link labels only while the drawing is shown too small to read them, under 11 pixels', () => {
    assert.ok(Math.abs(LABEL_SCALE - 11 / ((10.5 * 4) / 3)) < 1e-12);
    const on = { labels: true };
    assert.equal(labelsHidden(on, LABEL_SCALE - 0.01), true);
    assert.equal(labelsHidden(on, LABEL_SCALE), false);
    assert.equal(labelsHidden(on, 2), false);
    assert.equal(labelsHidden({ labels: false }, 0.25), false, 'off, every label is shown at any zoom');
  });
});

describe('a card’s state of the switches', () => {
  test('turning labels by zoom needs no new layout; every other switch does', () => {
    const state = new ViewState(startingSwitches(DEFAULT_SETTINGS));
    assert.equal(state.turn('labels', false), false);
    assert.equal(state.turn('groups', true), true);
    assert.equal(state.turn('groups', true), false, 'turned to what it was: nothing to do');
    assert.deepEqual(state.switches, { labels: false, hubs: false, groups: true, merge: false, engine: true });
    assert.deepEqual(state.saved(), { labels: 'off', hubs: 'off', groups: 'on', merge: 'off' });
  });

  test('folds the drawing as its switches say, and opens a hub or a group again, and folds it again', () => {
    const { drawing } = styledOf(star(13), GROUPED);
    const state = new ViewState({ labels: true, hubs: true, groups: true, merge: false, engine: false });
    const folded = state.folded(drawing);
    assert.deepEqual(folded.folding.hubs, [['hub', 13]]);
    assert.deepEqual(folded.folding.groups, [['Friends', ['ann', 'bob'], true]]);
    assert.deepEqual(state.hub(drawing, 'hub'), { links: 13, folded: true });
    assert.equal(state.hub(drawing, 'ann'), null, 'ann is no busy hub');
    state.open({ hub: 'hub' });
    state.open({ group: 'Friends' });
    assert.deepEqual(state.hub(drawing, 'hub'), { links: 13, folded: false });
    assert.equal(state.folded(drawing).folding, undefined);
    state.fold({ hub: 'hub' });
    assert.deepEqual(state.folded(drawing).folding.hubs, [['hub', 13]]);
    assert.deepEqual(state.plan?.hubs, [['hub', 13]], 'the last plan is kept, for what a tap on its stub opens');
  });

  test('a hub’s details count the links in its stub, and offer nothing with hubs unfolded or the hub in a folded box', () => {
    // two busy hubs joined: the link between them is in the first one's stub, so the second's holds 12
    const two = [
      star(13),
      ...Array.from({ length: 12 }, (_, i) => `(m${i}:Leaf {name: 'More ${i}'})`),
      "(hub2:Hub {name: 'Second hub'})",
      ...Array.from({ length: 12 }, (_, i) => `(hub2)-[:HAS]->(m${i})`),
      '(hub)-[:NEAR]->(hub2)',
    ].join(',\n');
    const { drawing } = styledOf(two);
    const state = new ViewState({ labels: true, hubs: true, groups: false, merge: false, engine: false });
    assert.deepEqual(state.hub(drawing, 'hub'), { links: 14, folded: true });
    assert.deepEqual(state.hub(drawing, 'hub2'), { links: 12, folded: true }, 'the links actually in its stub');
    state.turn('hubs', false);
    assert.deepEqual(state.hub(drawing, 'hub'), { links: 14, folded: false }, 'hubs not folded: open, offered to fold');
    const boxed = styledOf(star(13), `${GROUPED},\n(n3:Nudge {word: 'group', thing: 'hub', group: 'Centre'})`).drawing;
    const grouped = new ViewState({ labels: true, hubs: true, groups: true, merge: false, engine: false });
    assert.equal(grouped.hub(boxed, 'hub'), null, 'a hub inside a folded box is drawn as the box');
    grouped.open({ group: 'Centre' });
    assert.deepEqual(grouped.hub(boxed, 'hub'), { links: 13, folded: true });
  });

  test('with busy hubs not folded, every hub starts open, and the person folds one and opens it again', () => {
    const two = [
      star(13),
      ...Array.from({ length: 13 }, (_, i) => `(m${i}:Leaf {name: 'More ${i}'})`),
      "(hub2:Hub {name: 'Second hub'})",
      ...Array.from({ length: 13 }, (_, i) => `(hub2)-[:HAS]->(m${i})`),
    ].join(',\n');
    const { drawing } = styledOf(two);
    const state = new ViewState({ labels: true, hubs: false, groups: false, merge: false, engine: false });
    // 31 things: drawn in the groups their links make (untangle_found_groups), but no hub folded
    assert.deepEqual(state.folded(drawing).folding?.hubs ?? [], [], 'nothing folded to start');
    assert.deepEqual(state.hub(drawing, 'hub2'), { links: 13, folded: false });
    state.fold({ hub: 'hub2' });
    assert.deepEqual(state.folded(drawing).folding.hubs, [['hub2', 13]], 'only the hub folded');
    assert.deepEqual(state.hub(drawing, 'hub2'), { links: 13, folded: true });
    assert.deepEqual(state.hub(drawing, 'hub'), { links: 13, folded: false });
    state.open({ hub: 'hub2' });
    assert.deepEqual(state.folded(drawing).folding?.hubs ?? [], [], 'open again');
    state.fold({ hub: 'hub' });
    state.turn('hubs', true);
    state.turn('hubs', false);
    assert.deepEqual(state.folded(drawing).folding?.hubs ?? [], [], 'turning the switch starts every hub open again');
  });

  test('turning a switch on again folds what was opened again', () => {
    const { drawing } = styledOf(star(13));
    const state = new ViewState({ labels: true, hubs: true, groups: false, merge: false, engine: false });
    state.open({ hub: 'hub' });
    state.turn('hubs', false);
    state.turn('hubs', true);
    assert.deepEqual(state.folded(drawing).folding.hubs, [['hub', 13]]);
  });

  test('changes the drawing only: the drawing given and the note as read are as they were', () => {
    const { drawing, reading } = styledOf(star(13), GROUPED);
    const before = JSON.stringify([drawing, [...reading.graphs], reading.problems]);
    const state = new ViewState({ labels: true, hubs: true, groups: true, merge: true, engine: false });
    state.folded(drawing);
    state.open({ hub: 'hub' });
    state.folded(drawing);
    assert.equal(JSON.stringify([drawing, [...reading.graphs], reading.problems]), before);
    assert.equal(drawing.folding, undefined);
  });
});

describe('the switches’ names', () => {
  // proves: words_catalogue
  test('each switch is named in the person’s language', () => {
    setLanguage('en-XA');
    for (const s of VIEW_SWITCHES) assert.ok(isPseudoWord(switchName(s)), s);
  });
});

describe('a card regrouped to a thing and its neighbours (untangle_regroup)', () => {
  // the links of star(3): 0 hub→leaf1, 1 hub→leaf2, 2 hub→leaf3, 3 ann→bob
  const only = { things: new Set(['hub', 'leaf1', 'leaf2']), edges: new Set([0, 1]) };

  test('lays out only what it keeps: the rest left out, its links kept by their places, no hub folded', () => {
    const { drawing } = styledOf(star(3));
    const state = new ViewState(startingSwitches(DEFAULT_SETTINGS)),
      card = {};
    assert.equal(state.folded(drawing, card).folding, undefined, 'nothing kept yet: the whole graph');
    state.keepOnly(card, only);
    const { folding } = state.folded(drawing, card);
    assert.deepEqual(folding.hidden, ['leaf3', 'ann', 'bob']);
    assert.deepEqual(folding.folded, [2, 3]);
    assert.deepEqual(folding.hubs, []);
    assert.equal(state.plan, undefined, 'the plan the other cards share is the whole graph’s');
  });

  test('a busy hub shown with its neighbours is drawn with its links, not a stub', () => {
    const { drawing } = styledOf(star(13));
    const state = new ViewState(startingSwitches(DEFAULT_SETTINGS)),
      card = {};
    state.keepOnly(card, only);
    const { folding } = state.folded(drawing, card);
    assert.deepEqual(folding.hubs, []);
    assert.ok(!folding.folded.includes(0) && !folding.folded.includes(1));
    assert.ok(!folding.hidden.includes('leaf1'));
  });

  test('is that card’s alone, and the whole graph comes back when it is let go', () => {
    const { drawing } = styledOf(star(3));
    const state = new ViewState(startingSwitches(DEFAULT_SETTINGS)),
      card = {},
      other = {};
    state.keepOnly(card, only);
    assert.equal(state.folded(drawing, other).folding, undefined);
    assert.equal(state.folded(drawing).folding, undefined);
    state.keepOnly(card, null);
    assert.equal(state.folded(drawing, card).folding, undefined);
  });

  test('a group keeps its box while one of its things is kept, and goes with the last', () => {
    const { drawing } = styledOf(star(3), GROUPED);
    const state = new ViewState({ labels: true, hubs: true, groups: true, merge: false, engine: false }),
      card = {};
    state.keepOnly(card, { things: new Set(['ann']), edges: new Set() });
    assert.deepEqual(state.folded(drawing, card).folding.groups, [['Friends', ['ann', 'bob'], true]]);
    state.keepOnly(card, only);
    assert.deepEqual(state.folded(drawing, card).folding.groups, []);
  });
});

// two teams of 16, each linked within itself, and three links between them: 32 things, so their groups are found
const teams = () => {
  const team = (t, name) =>
    Array.from({ length: 16 }, (_, i) => `(${t}${i}:Person {name: '${name} ${i}'}),`).concat(
      Array.from(
        { length: 48 },
        (_, i) => `(${t}${i % 16})-[:WORKS_WITH]->(${t}${(i + 1 + Math.floor(i / 16)) % 16}),`,
      ),
      Array.from({ length: 8 }, (_, i) => `(${t}0)-[:LEADS]->(${t}${i * 2 + 1}),`),
    );
  return [
    '// graph: g',
    ...team('a', 'Ann'),
    ...team('b', 'Bob'),
    '(a3)-[:HELPS]->(b3), (a5)-[:HELPS]->(b5),',
    '(a7)-[:HELPS]->(b7)',
  ].join('\n');
};

describe('a large network with no groups written', () => {
  // proves: untangle_found_groups
  test('is drawn in the groups its links make, named by their most linked thing, their links merged', () => {
    const { drawing } = styledOf(teams());
    const state = new ViewState(startingSwitches(DEFAULT_SETTINGS));
    const folded = state.folded(drawing);
    const groups = state.plan.groups.map(([label, things]) => [label, things.length]);
    assert.deepEqual(groups, [
      ['Ann 0', 16],
      ['Bob 0', 16],
    ]);
    assert.equal(state.plan.merge, true, 'the links between the two groups merged, a bundle');
    assert.equal(state.switches.merge, true, 'and the View menu says so');
    const drawnAs = folded.nudges.filter((n) => n.word === 'group');
    assert.equal(drawnAs.length, 32, 'each thing drawn in its group');
    assert.equal(drawing.nudges?.length ?? 0, 0, 'the drawing given is never changed');
  });

  // proves: untangle_found_groups
  test('keeps its links apart once merging is turned off, and is drawn as ever when small or grouped', () => {
    const { drawing } = styledOf(teams());
    const state = new ViewState(startingSwitches(DEFAULT_SETTINGS));
    state.folded(drawing);
    state.turn('merge', false);
    state.folded(drawing);
    assert.equal(state.plan?.merge ?? false, false);
    const small = styledOf(star(3)).drawing;
    const plain = new ViewState(startingSwitches(DEFAULT_SETTINGS));
    assert.equal(plain.folded(small).nudges?.length ?? 0, 0, 'a graph of fewer than 30 things finds no groups');
    const grouped = styledOf(
      teams(),
      GROUPED.replace("thing: 'ann'", "thing: 'a1'").replace("thing: 'bob'", "thing: 'a2'"),
    );
    const written = new ViewState(startingSwitches(DEFAULT_SETTINGS)).folded(grouped.drawing);
    assert.deepEqual(
      written.nudges.map((n) => n.group),
      ['Friends', 'Friends'],
      'groups written are drawn, none found',
    );
  });
});
