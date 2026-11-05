// A branch opened glides out of its parent (editor spec §71, explore_stays_put). Roger, 1 Nov 2026: nodes must not jump.
// Opening a branch puts its new things where the layout gives them. The eye follows them out of the thing they came
// from. The things already shown stay where they are on the screen.
// Requirements: explore_stays_put.
// - The exploration tells the card each thing's parent and its centre, so new things know where to glide from.
// - A new box starts on its parent's place; a deeper one, on its nearest parent that was drawn.
// - A box drawn before starts where it was; one that has not moved is left alone.
// - Where motion is to be still, nothing glides.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExploreSession } from '../src/explore-session.ts';
import { edgesOf } from '../src/focus.ts';
import { glideBoxes } from '../src/display/graph-view/regroup.ts';

const box = (key) => ({ key, kind: 'Thing', text: key });
const link = (from, to) => ({ from, to, type: 'Thing', reading: 'links' });
const TREE = {
  graph: 'G',
  boxes: ['idea', 'a', 'b', 'a1', 'a2'].map(box),
  links: [link('idea', 'a'), link('idea', 'b'), link('a', 'a1'), link('a', 'a2')],
  estimates: [],
};

// proves: explore_stays_put
test('the exploration tells the card each thing’s parent, and its centre, for what is new to glide out of', () => {
  const s = new ExploreSession(TREE, 'idea');
  s.open('a');
  const kept = s.kept(edgesOf(TREE));
  assert.equal(kept.centre, 'idea');
  assert.deepEqual([...kept.parents].sort(), [
    ['a', 'idea'],
    ['a1', 'a'],
    ['a2', 'a'],
    ['b', 'idea'],
  ]);
});

/** A rectangle at `x`, `y`, 10 by 10, as the screen gives one. */
const rect = (x, y) => ({ left: x, top: y, right: x + 10, bottom: y + 10, width: 10, height: 10, x, y });

/** A box of the drawing by key at a spot, noting what it was told to animate. */
function boxAt(key, x, y) {
  const g = {
    key,
    moves: [],
    getAttribute: (n) => (n === 'data-key' ? key : null),
    getBoundingClientRect: () => rect(x, y),
    getBBox: () => ({ width: 10 }),
    animate(frames) {
      this.moves.push(frames[0].translate);
    },
  };
  return g;
}

/** A drawing of those boxes, on a page that asks for reduced motion or not. */
function drawingOf(boxes, still = false) {
  return {
    win: { document: { body: { classList: { contains: () => false } } }, matchMedia: () => ({ matches: still }) },
    querySelectorAll: (q) => (q.startsWith('g.node') ? boxes : []),
  };
}

// proves: explore_stays_put
test('a new box glides out of its parent’s place, and a deeper one out of its nearest parent drawn before', () => {
  const was = new Map([
    ['idea', rect(100, 100)],
    ['a', rect(200, 100)],
  ]);
  const [idea, a, a1, a1x] = [
    boxAt('idea', 100, 100),
    boxAt('a', 200, 100),
    boxAt('a1', 300, 100),
    boxAt('a1x', 400, 100),
  ];
  const parents = new Map([
    ['a', 'idea'],
    ['a1', 'a'],
    ['a1x', 'a1'],
  ]);
  glideBoxes(drawingOf([idea, a, a1, a1x]), was, parents);
  assert.deepEqual(idea.moves, ['0px 0px'], 'a box that has not moved starts where it is');
  assert.deepEqual(a.moves, ['0px 0px']);
  assert.deepEqual(a1.moves, ['-100px 0px'], 'out of its parent, a, 100 to the left of it');
  assert.deepEqual(a1x.moves, ['-200px 0px'], 'out of a, the nearest parent that was drawn');
});

// proves: explore_stays_put
test('without parents a new box just appears, and a box drawn before starts where it was', () => {
  const was = new Map([['a', rect(150, 100)]]);
  const [a, fresh] = [boxAt('a', 200, 100), boxAt('fresh', 300, 100)];
  glideBoxes(drawingOf([a, fresh]), was);
  assert.deepEqual(a.moves, ['-50px 0px']);
  assert.deepEqual(fresh.moves, []);
});

// proves: explore_stays_put
test('where motion is to be still, nothing glides', () => {
  const a = boxAt('a', 200, 100);
  glideBoxes(drawingOf([a], true), new Map([['a', rect(100, 100)]]));
  assert.deepEqual(a.moves, []);
});
