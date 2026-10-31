// Exploring as a mind map from one thing (editor spec §71): explore-map.ts.
// - Opening a branch adds only that thing's hidden neighbours, a few at a time, best-linked first.
// - Closing a branch hides all reached through it. Nothing else shown changes either way.
// - What is shown is a tree from the centre; other links between shown things are cross-links.
// - The depth dial opens every branch to so many steps. Recentring keeps all shown. The state round-trips.
// Requirements: explore_branch_open, explore_branch_close, explore_tree_from_centre, explore_depth, explore_recentre,
// explore_back and explore_capped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPANSION_MOST } from '../src/expand-on-demand.ts';
import { BRANCH_FIRST, BRANCH_RANGE, DEPTH_MOST, ExploreMap } from '../src/explore-map.ts';

const box = (key) => ({ key, kind: 'Thing', text: key });
const link = (from, to) => ({ from, to, type: 'Thing', reading: 'links' });
const drawing = (keys, links) => ({ graph: 'G', boxes: keys.map(box), links, estimates: [] });

/**
 * A small mind: idea links to a, b and c. a leads on to a1 and a2, b to b1, and a2 also links to b1. z is apart.
 */
const MIND = drawing(
  ['idea', 'a', 'b', 'c', 'a1', 'a2', 'b1', 'z'],
  [link('idea', 'a'), link('idea', 'b'), link('c', 'idea'), link('a', 'a1'), link('a', 'a2'), link('b', 'b1')].concat(
    link('a2', 'b1'),
  ),
);

test('it starts with the centre alone, and each badge counts the neighbours not shown', () => {
  const m = new ExploreMap(MIND, 'idea');
  assert.deepEqual(m.keys(), ['idea']);
  assert.equal(m.hidden('idea'), 3);
  assert.equal(m.hidden('z'), 0);
  assert.equal(m.depthOf('idea'), 0);
  assert.equal(m.depthOf('a'), -1, 'a is not shown');
});

test('opening a branch adds only that thing’s neighbours, and nothing else shown changes', () => {
  const m = new ExploreMap(MIND, 'idea');
  assert.deepEqual(m.open('idea'), ['a', 'b', 'c'], 'either way along each link');
  assert.deepEqual(m.open('a'), ['a1', 'a2']);
  assert.deepEqual(m.keys(), ['idea', 'a', 'b', 'c', 'a1', 'a2'], 'b’s branch stays shut');
  assert.equal(m.parentOf('a2'), 'a');
  assert.equal(m.depthOf('a2'), 2);
  assert.deepEqual(m.childrenOf('idea'), ['a', 'b', 'c']);
  assert.equal(m.hidden('a'), 0);
  assert.equal(m.hidden('a2'), 1, 'b1 waits behind a2’s badge too');
  assert.deepEqual(m.open('z'), [], 'a thing not shown has no branch to open');
  assert.equal(MIND.boxes.length, 8, 'the drawing is never changed');
});

test('closing a branch hides all reached through it, and the thing itself stays', () => {
  const m = new ExploreMap(MIND, 'idea');
  m.open('idea');
  m.open('a');
  m.open('a2');
  assert.deepEqual(m.close('a').sort(), ['a1', 'a2', 'b1']);
  assert.deepEqual(m.keys(), ['idea', 'a', 'b', 'c']);
  assert.equal(m.hidden('a'), 2);
  assert.deepEqual(m.close('c'), [], 'closing a shut branch hides nothing');
});

test('a big branch shows a few at a time, best-linked first, kept in the order written', () => {
  const spokes = Array.from({ length: 30 }, (_, i) => `s${i}`);
  // s29 has a second link, so it is better linked than the rest
  const d = drawing(['hub', ...spokes, 'far'], [...spokes.map((s) => link('hub', s)), link('s29', 'far')]);
  const m = new ExploreMap(d, 'hub');
  const first = m.open('hub');
  assert.equal(first.length, BRANCH_FIRST);
  assert.ok(first.includes('s29'), 'the best-linked comes first');
  assert.deepEqual(first.slice(0, 3), ['s0', 's1', 's2'], 'then ties in the order written');
  assert.equal(first.at(-1), 's29', 'and all are shown in the order written');
  assert.equal(m.hidden('hub'), 30 - BRANCH_FIRST, 'the rest wait as + more');
  assert.equal(m.open('hub').length, BRANCH_FIRST, 'opened again, it shows the next few');
  m.perBranch = 100;
  assert.equal(m.perBranch, BRANCH_RANGE[1], 'the dial stops at its most');
  m.perBranch = 1;
  assert.equal(m.perBranch, BRANCH_RANGE[0], 'and at its least');
});

test('links between shown things that are not a step along a branch are cross-links', () => {
  const m = new ExploreMap(MIND, 'idea');
  m.toDepth(3);
  assert.equal(m.parentOf('b1'), 'b', 'b1 was first reached from b');
  assert.deepEqual(m.crossLinks(), [{ from: 'a2', to: 'b1' }]);
  const twice = drawing(['p', 'q'], [link('p', 'q'), link('q', 'p')]);
  const t = new ExploreMap(twice, 'p');
  t.open('p');
  assert.deepEqual(t.crossLinks(), [{ from: 'q', to: 'p' }], 'a second link between parent and child is a cross-link');
});

test('the depth dial opens every branch so many steps out, and closes what lies further', () => {
  const m = new ExploreMap(MIND, 'idea');
  m.toDepth(1);
  assert.deepEqual(m.keys(), ['idea', 'a', 'b', 'c']);
  const { added } = m.toDepth(2);
  assert.deepEqual(added, ['a1', 'a2', 'b1']);
  const { gone } = m.toDepth(1);
  assert.deepEqual(gone.sort(), ['a1', 'a2', 'b1']);
  assert.deepEqual(m.keys(), ['idea', 'a', 'b', 'c']);
  m.toDepth(0);
  assert.deepEqual(m.keys(), ['idea']);
  m.toDepth(DEPTH_MOST + 10);
  assert.ok(
    m.keys().every((k) => m.depthOf(k) <= DEPTH_MOST),
    'the dial stops at its most',
  );
});

test('recentring keeps everything shown and reads each parent again from the new centre', () => {
  const m = new ExploreMap(MIND, 'idea');
  m.toDepth(2);
  const shown = m.keys().sort();
  m.recentre('a');
  assert.equal(m.centre, 'a');
  assert.deepEqual(m.keys().sort(), shown, 'nothing appears or goes');
  assert.equal(m.parentOf('a'), undefined);
  assert.equal(m.parentOf('idea'), 'a');
  assert.equal(m.parentOf('b'), 'idea');
  assert.equal(m.parentOf('b1'), 'a2', 'b1 is nearer the new centre through a2');
});

test('its state round-trips, so Back and Next give the same picture again', () => {
  const m = new ExploreMap(MIND, 'idea', 8);
  m.open('idea');
  m.open('b');
  const state = m.state();
  assert.deepEqual(state, {
    centre: 'idea',
    parents: [
      ['a', 'idea'],
      ['b', 'idea'],
      ['c', 'idea'],
      ['b1', 'b'],
    ],
    perBranch: 8,
  });
  const back = ExploreMap.from(MIND, state);
  assert.deepEqual(back.keys(), m.keys());
  assert.deepEqual(back.state(), state);
  const fewer = drawing(['idea', 'a', 'b'], [link('idea', 'a'), link('idea', 'b')]);
  assert.deepEqual(ExploreMap.from(fewer, state).keys(), ['idea', 'a', 'b'], 'things gone since are left out');
});

test('the part to lay out holds only what is shown, and an exploration never outgrows one layout', () => {
  const m = new ExploreMap(MIND, 'idea');
  m.open('idea');
  assert.deepEqual(
    m.part().boxes.map((b) => b.key),
    ['idea', 'a', 'b', 'c'],
  );
  // a tree with 40 children a thing, four levels deep: far more than one layout holds
  const keys = ['r'],
    links = [];
  let level = ['r'];
  for (let d = 0; d < 3; d++) {
    const next = [];
    for (const p of level)
      for (let i = 0; i < 40; i++) {
        keys.push(`${p}.${i}`);
        links.push(link(p, `${p}.${i}`));
        next.push(`${p}.${i}`);
      }
    level = next;
  }
  const big = new ExploreMap(drawing(keys, links), 'r', 40);
  big.toDepth(DEPTH_MOST);
  assert.ok(big.keys().length <= EXPANSION_MOST, `${big.keys().length} shown`);
});
