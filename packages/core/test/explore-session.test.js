// One card's exploration as its controls drive it (editor spec §71): explore-session.ts, and how a card lays it out.
// Requirements: explore_from_here, explore_badges, explore_back, explore_shapes and explore_stays_put.
// - Exploring starts from one thing with its direct links; each thing with neighbours waiting has a badge.
// - Every change is one step on the trail, so Back and Next reach it again; a new shape lays the map out afresh.
// - The card is given what to keep and each thing's spot, and the core's Untangle hides the rest.
// - Laid out, the given spots go to our own engine, as a plug-in's would.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPLORE_STRATEGY, ExploreSession } from '../src/explore-session.ts';
import { edgesOf } from '../src/focus.ts';
import { Untangle } from '../src/untangle.ts';
import { DEFAULT_SETTINGS } from '../src/settings.ts';
import { ViewState, startingLayout, startingSwitches } from '../src/view-switches.ts';

const box = (key) => ({ key, kind: 'Thing', text: key });
const link = (from, to) => ({ from, to, type: 'Thing', reading: 'links' });

/** An idea with three branches, one with two leaves, and a cross-link from a leaf back to another branch. */
const MIND = {
  graph: 'G',
  boxes: ['idea', 'a', 'b', 'c', 'a1', 'a2', 'far'].map(box),
  links: [link('idea', 'a'), link('idea', 'b'), link('idea', 'c'), link('a', 'a1'), link('a', 'a2'), link('a1', 'b')],
  estimates: [],
};
const edges = edgesOf(MIND);

test('exploring starts from one thing and its direct links, each with neighbours waiting badged', () => {
  const s = new ExploreSession(MIND, 'idea');
  assert.deepEqual(s.keys(), ['idea', 'a', 'b', 'c']);
  assert.equal(s.depth, 1);
  assert.deepEqual(s.badges(), [
    { key: 'a', hidden: 2, open: false },
    { key: 'b', hidden: 1, open: false },
  ]);
  assert.ok(s.open('a'));
  const a = s.badges().find((b) => b.key === 'a');
  assert.deepEqual(a, { key: 'a', hidden: 0, open: true }, 'an open branch keeps a badge, to close it');
  assert.ok(s.close('a'));
  assert.ok(!s.close('a'), 'closing a closed branch changes nothing');
});

test('every change is a step on the trail: Back and Next reach it again', () => {
  const s = new ExploreSession(MIND, 'idea');
  assert.equal(s.canBack, false);
  s.open('a');
  s.setShape('rings');
  assert.deepEqual(s.keys(), ['idea', 'a', 'b', 'c', 'a1', 'a2']);
  assert.ok(s.back());
  assert.equal(s.shape, 'balanced');
  assert.ok(s.back());
  assert.deepEqual(s.keys(), ['idea', 'a', 'b', 'c']);
  assert.ok(!s.back(), 'nothing before the start');
  assert.ok(s.next() && s.next());
  assert.equal(s.shape, 'rings');
  assert.deepEqual(s.keys(), ['idea', 'a', 'b', 'c', 'a1', 'a2']);
  assert.ok(!s.setShape('rings'), 'the shape it has already is no change');
});

test('the card keeps what is shown, each thing at its spot, and nothing already shown moves', () => {
  const s = new ExploreSession(MIND, 'idea');
  const first = s.kept(edges);
  assert.deepEqual([...first.things], ['idea', 'a', 'b', 'c']);
  assert.deepEqual([...first.placed.keys()].sort(), ['a', 'b', 'c', 'idea']);
  assert.deepEqual(first.placed.get('idea'), [0, 0]);
  s.open('a');
  const then = s.kept(edges);
  for (const k of first.things) assert.deepEqual(then.placed.get(k), first.placed.get(k), `${k} stays put`);
  // a1 to b is not a step along a branch: it is a cross-link, drawn faint and dashed
  const cross = edges.findIndex((e) => e.from === 'a1' && e.to === 'b');
  assert.deepEqual([...then.cross], [cross]);
  assert.ok(then.edges.has(cross), 'a cross-link is still shown');
  assert.ok(s.setShape('top-down'));
  const down = s.kept(edges);
  assert.ok(down.placed.get('a')[1] > 0, 'a new shape lays the map out afresh');
});

test("the core's untangling hides what an exploration does not show, and Show only ends it", () => {
  const u = new Untangle(MIND);
  u.exploreFrom('idea');
  assert.ok(u.active());
  assert.deepEqual([...u.layers(null).hidden.things].sort(), ['a1', 'a2', 'far']);
  u.explore.open('a');
  assert.deepEqual([...u.layers(null).hidden.things], ['far']);
  u.showOnly('a', 1);
  assert.equal(u.explore, null);
  u.exploreFrom('a');
  assert.equal(u.only, null);
  u.showAll();
  assert.equal(u.active(), false);
});

test('laid out, an exploration goes to our own engine with its spots, as a plug-in layout does', () => {
  const state = new ViewState(startingSwitches(DEFAULT_SETTINGS), startingLayout(undefined));
  const card = {};
  const s = new ExploreSession(MIND, 'idea');
  state.keepOnly(card, s.kept(edges));
  const d = state.folded(MIND, card);
  assert.equal(d.engine, 'own');
  assert.equal(d.layoutOptions.strategy, EXPLORE_STRATEGY);
  assert.deepEqual(Object.keys(d.placed).sort(), ['a', 'b', 'c', 'idea']);
  state.keepOnly(card, null);
  assert.equal(state.folded(MIND, card).placed, undefined, 'the whole graph again is laid out as before');
  // Show only keeps a plain set, with no spots: it is laid out by the engine as before
  const plain = { things: new Set(['idea', 'a']), edges: new Set([0]) };
  state.keepOnly(card, plain);
  assert.equal(state.folded(MIND, card).placed, undefined);
  assert.notEqual(state.folded(MIND, card).layoutOptions?.strategy, EXPLORE_STRATEGY);
  state.keepOnly(card, { ...plain, placed: { idea: [0, 0] } });
  assert.equal(state.folded(MIND, card).placed, undefined, 'only spots an exploration gives switch the engine');
});
