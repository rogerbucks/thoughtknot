// The roads' ways, part of layer L4 (editor spec §73, render_road_ways): render/render-roads.ts. A road shows which
// way its links run, says what kind of link it is between items, and stands apart from a road it crosses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apartOf, chevronsOf, roundRooms, sayOf, wordsOf } from '../src/render/render-roads.ts';
import { paintCanvas } from '../src/render/paint-canvas.ts';

const road = (over = {}) => ({
  kind: 'road',
  a: 'a',
  b: 'b',
  from: [0, 0],
  to: [300, 0],
  forward: 1,
  back: 0,
  width: 2,
  fill: '#4b7bf5',
  count: '',
  ink: '#203a80',
  chip: '#ffffff',
  alpha: 1,
  ...over,
});

// Roger, 7 Nov 2026: no "to" arrows to show direction; highways clearly directional, chevrons each way.
// proves: render_road_ways
test('chevrons run along a road the way its links go, in two rows side by side where they go both ways', () => {
  const one = chevronsOf(road());
  assert.ok(one.length >= 3, 'a long road has chevrons all along it');
  for (const [, y, a] of one) assert.ok(y === 0 && Math.abs(a) < 1e-9, 'on the line, pointing from a to b');
  const back = chevronsOf(road({ forward: 0, back: 2 }));
  for (const [, , a] of back) assert.ok(Math.abs(Math.abs(a) - Math.PI) < 1e-9, 'pointing from b to a');
  const both = chevronsOf(road({ forward: 1, back: 1 }));
  const ahead = both.filter(([, , a]) => Math.abs(a) < 1e-9),
    behind = both.filter(([, , a]) => Math.abs(a) > 1);
  assert.equal(ahead.length, behind.length, 'one row each way');
  assert.ok(
    ahead.every(([, y]) => y > 0) && behind.every(([, y]) => y < 0),
    'the two rows side by side, either side of the line',
  );
  // the chip in the middle stays clear of chevrons
  const chip = chevronsOf(road({ count: '3 →', forward: 3 }));
  assert.ok(
    chip.every(([x]) => Math.abs(x - 150) >= 26),
    'none under the count',
  );
  assert.deepEqual(chevronsOf(road({ to: [10, 0] })), [], 'a stub too short for one has none');
  // on an arch, they follow the curve
  const arch = chevronsOf(road({ via: [150, -120] }));
  assert.ok(
    arch.some(([, y]) => y < -20),
    'they rise with the arch',
  );
});

// Roger, 7 Nov 2026: edges don't seem to have labels.
// proves: render_road_ways
test('a road between items says what kind of link it is, and how many where there are several', () => {
  assert.equal(wordsOf('DEPENDS_ON'), 'depends on');
  assert.equal(sayOf(['DEPENDS_ON'], 1, 0), 'depends on');
  assert.equal(sayOf(['RELATES'], 2, 1), 'relates · 2 ⇄ 1');
  assert.equal(sayOf(['A', 'B'], 2, 0), '2 →', 'of several kinds, it counts them');
  assert.equal(sayOf(['A', 'B'], 1, 0), '');
});

// Roger, 7 Nov 2026: edges that cross should differ in colour and style, so it is obvious which is which.
// proves: render_road_ways
test('where two roads cross, the later is dashed in the colour of its other end; roads that meet are not', () => {
  const colours = new Map([
    ['c', '#e8833a'],
    ['d', '#2f9e6e'],
  ]);
  const first = road();
  const across = road({ a: 'c', b: 'd', from: [150, -100], to: [150, 100] });
  const [p, q] = apartOf([first, across], colours);
  assert.equal(p.dash, undefined, 'the first is drawn plain');
  assert.deepEqual(q.dash, [7, 5], 'the one across it is dashed');
  assert.equal(q.fill, '#2f9e6e', 'in its other end’s colour');
  const meeting = road({ a: 'b', b: 'd', from: [300, 0], to: [300, 100] });
  assert.equal(apartOf([first, meeting], colours)[1].dash, undefined, 'a road from the same room crosses nothing');
  const aside = road({ a: 'c', b: 'd', from: [0, 50], to: [300, 50] });
  assert.equal(apartOf([first, aside], colours)[1].dash, undefined, 'a road alongside is left plain');
});

// proves: render_painters_agree
test('the painter dashes a road that crosses another and draws its chevrons in its ink', () => {
  const calls = [];
  const said = { strokes: [], dashes: [] };
  const c = new Proxy(
    {},
    {
      get: (_, k) =>
        k === 'setLineDash' ? (d) => said.dashes.push(d) : (...a) => (calls.push([k, ...a]), { addColorStop() {} }),
      set: (_, k, v) => (k === 'strokeStyle' && said.strokes.push(v), true),
    },
  );
  const m = road({ dash: [7, 5], chevrons: [[100, 0, 0]] });
  paintCanvas(c, [m], 400, 100);
  assert.deepEqual(said.dashes, [[7, 5], []], 'dashed for the road, then plain again');
  assert.ok(said.strokes.includes('#203a80'), 'chevrons in its ink');
  assert.ok(
    calls.some((k) => k[0] === 'lineTo' && k[1] === 100 && k[2] === 0),
    'a chevron with its tip on the spot',
  );
});

// Roger, 13 Nov 2026: a road to another room ran straight over a room between its ends.
// proves: render_marks
test('a road bends round a room between its ends, never round its own rooms or the room that holds them', () => {
  const room = (key, x, y, r, depth = 1, within = [key]) => ({ key, x, y, r, depth, within: new Set(within) });
  const road = { a: 'A', b: 'B' };
  const ends = new Set(['A', 'B', 'Top']);
  const [from, to] = [
    [0, 0],
    [400, 0],
  ];
  assert.equal(roundRooms(from, to, [], road, 1, ends), undefined, 'a clear line stays straight');
  // a room sits a little above the middle of the line: the road bows under it, clear of its edge
  const via = roundRooms(from, to, [room('C', 200, -10, 40)], road, 1, ends);
  assert.ok(via, 'a room in the way bends it');
  const middle = (via[1] + 0) / 2; // the curve's middle, half way from the line to its control point
  assert.ok(middle > 30 + 8 - 1, `it passes under the room, clear of it (${middle})`);
  // its own ends, a room inside an end, and the room that holds both ends are its own: no bend for those
  const own = [room('A', 200, 0, 40), room('Inside', 200, 0, 30, 1, ['Inside', 'A']), room('Top', 200, 0, 50, 0)];
  assert.equal(roundRooms(from, to, own, road, 1, ends), undefined);
  // a room wider than the road cannot be gone round, and a deeper room is not in the way of this road
  assert.equal(roundRooms(from, to, [room('Big', 200, 0, 300)], road, 1, ends), undefined);
  assert.equal(roundRooms(from, to, [room('Deep', 200, 0, 40, 2)], road, 1, ends), undefined);
});
