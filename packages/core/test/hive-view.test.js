// The hive view (editor spec §68, projection_hive): hive-view.ts. Things sit on two to five axes by kind, or by what
// their links do. Along an axis, the most linked sit furthest out. Each link is a curve between axes. The same data
// gives the same picture, and every mark stays inside the space.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hiveAxes, hiveMarks } from '../src/view-types/hive-view.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';

const SPACE = { width: 500, height: 400 };
/** A shape of things `[key, kind]` and links `[from, to]`. */
const shapeOf = (things, links = []) => ({
  things: things.map(([key, kind]) => ({ key, text: key.toUpperCase(), kinds: kind ? [kind] : [] })),
  links: links.map(([from, to]) => ({ from, type: 'LINKS', to })),
});
const centre = [250, 200];
const angleOf = (m) => Math.atan2(m.y + m.height / 2 - centre[1], m.x + m.width / 2 - centre[0]);
const reach = (m) => Math.hypot(m.x + m.width / 2 - centre[0], m.y + m.height / 2 - centre[1]);

// proves: projection_hive
test('things sit on an axis per kind, the most linked furthest out, each link a curve between axes', () => {
  const shape = shapeOf(
    [
      ['p1', 'Person'],
      ['p2', 'Person'],
      ['t1', 'Team'],
      ['t2', 'Team'],
    ],
    [
      ['p1', 't1'],
      ['p2', 't1'],
      ['p1', 't2'],
    ],
  );
  assert.deepEqual(
    hiveAxes(shape).map((a) => [a.name, a.keys]),
    [
      ['Person', ['p2', 'p1']],
      ['Team', ['t2', 't1']],
    ],
  );
  const marks = hiveMarks({ shape, space: SPACE });
  const box = (k) => marks.find((m) => m.id === k);
  assert.ok(Math.abs(angleOf(box('p1')) - angleOf(box('p2'))) < 1e-9, 'one axis for a kind');
  assert.ok(Math.abs(angleOf(box('p1')) - angleOf(box('t1'))) > 1, 'another for the next');
  assert.ok(reach(box('p1')) > reach(box('p2')), 'more links, further out');
  const links = marks.filter((m) => m.kind === 'link' && m.role === 'link');
  assert.equal(links.length, 3);
  assert.ok(links.every((l) => l.curve && l.points.length === 4));
  assert.equal(marks.filter((m) => m.id.startsWith('spoke\n')).length, 2);
  assert.deepEqual(hiveMarks({ shape, space: SPACE }), marks, 'the same data, the same picture');
  assert.ok(Array.isArray(drawMarksOf(marks, SPACE)));
});

// proves: projection_hive
test('with one kind the axes are what the links do, and past five kinds the smallest share one', () => {
  const one = shapeOf(
    [['a'], ['b'], ['c'], ['d']],
    [
      ['a', 'b'],
      ['b', 'c'],
    ],
  );
  assert.deepEqual(
    hiveAxes(one).map((a) => [a.name, a.keys]),
    [
      ['Sends', ['a']],
      ['Sends and receives', ['b']],
      ['Receives', ['c']],
      ['Not linked', ['d']],
    ],
  );
  const kinds = ['A', 'A', 'B', 'C', 'D', 'E', 'F'].map((k, i) => [`t${i}`, k]);
  const axes = hiveAxes(shapeOf(kinds));
  assert.equal(axes.length, 5);
  assert.deepEqual(axes.at(-1), { name: '2 other kinds', keys: ['t5', 't6'] });
  assert.deepEqual(hiveMarks({ shape: shapeOf([]), space: SPACE }), []);
  const many = shapeOf(
    [...Array(60).keys()].map((i) => [`m${i}`, i % 3 ? 'X' : 'Y']),
    [...Array(59).keys()].map((i) => [`m${i}`, `m${i + 1}`]),
  );
  assert.ok(Array.isArray(drawMarksOf(hiveMarks({ shape: many, space: SPACE }), SPACE)), 'inside the space');
});
