// Lanes on the new stage (editor spec §73, render_lanes): render/render-lanes.ts. Things run left to right as their
// links run. Each kind keeps a lane of its own, in the order the kinds link. Each lane is drawn under the dots and
// named by its kind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lanesLaid, laneOrder } from '../src/render/render-lanes.ts';

const thing = (key, kind) => ({ key, text: `${kind} ${key}`, kinds: [kind] });
const link = (from, to) => ({ from, type: 'NEEDS', to });
// goals need tasks, and tasks need steps
const SHAPE = {
  things: [thing('g1', 'Goal'), thing('g2', 'Goal'), thing('t1', 'Task'), thing('t2', 'Task'), thing('s1', 'Step')],
  links: [link('g1', 't1'), link('g2', 't2'), link('t1', 's1'), link('t2', 's1')],
};

test('each kind has a lane of its own, in the order the kinds link', () => {
  assert.deepEqual(laneOrder(SHAPE), ['Goal', 'Task', 'Step']);
  const { places } = lanesLaid(SHAPE);
  const x = (k) => places.get(k).x;
  assert.ok(x('g1') === x('g2') && x('g1') < x('t1') && x('t1') === x('t2') && x('t2') < x('s1'));
});

test('things in one lane stand apart, far enough to read their names', () => {
  const { places } = lanesLaid(SHAPE);
  assert.ok(Math.abs(places.get('t1').y - places.get('t2').y) >= 40);
});

test('each lane is drawn round its things and named by its kind', () => {
  const { places, marks } = lanesLaid(SHAPE);
  const lanes = marks.filter((m) => m.kind === 'group');
  assert.equal(lanes.length, 3);
  for (const [k, p] of places) {
    const kind = SHAPE.things.find((t) => t.key === k).kinds[0];
    const at = ['Goal', 'Task', 'Step'].indexOf(kind);
    const lane = lanes[at];
    assert.ok(p.x > lane.x && p.x < lane.x + lane.width && p.y > lane.y && p.y < lane.y + lane.height, k);
  }
  assert.deepEqual(
    marks.filter((m) => m.kind === 'label').map((m) => m.text),
    ['Goal', 'Task', 'Step'],
  );
});

test('the same graph always gives the same places', () => {
  assert.deepEqual([...lanesLaid(SHAPE).places], [...lanesLaid(SHAPE).places]);
});
