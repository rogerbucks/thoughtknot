// A graph's connected parts, each laid out on its own and packed to a screen's shape (editor spec §68:
// layout_parts_packed). Its file is layouts/parts.ts; own-engine.ts packs boxes with it, space-parts.ts packs space.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { packed, partsOf, trayOf } from '../src/layouts/parts.ts';
import { ownSpots } from '../src/layouts/own-engine.ts';
import { SCREEN } from '../src/layouts/folded-rows.ts';
import { partsNear } from '../src/space-parts.ts';

const box = (of, width = 120) => ({ kind: 'box', id: of, role: 'thing', of, name: of, x: 0, y: 0, width, height: 40 });
const link = (from, to) => ({ kind: 'link', id: `${from} ${to}`, from, to, points: [], curve: false });

// a flow of six, a pair, and three things with no link, written out of name order
const FLOW = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'];
const MARKS = [
  ...FLOW.map((k) => box(k)),
  box('p1'),
  box('p2'),
  box('zebra'),
  box('apple'),
  box('mango'),
  ...[
    ['f1', 'f2'],
    ['f1', 'f3'],
    ['f2', 'f4'],
    ['f3', 'f5'],
    ['f4', 'f6'],
    ['f5', 'f6'],
    ['p1', 'p2'],
  ].map(([a, b]) => link(a, b)),
];
const laid = (marks) => ({ marks, space: { width: 0, height: 0 } });

/** The bounds of the boxes of `keys` at `spots`, each 120 by 40 unless `sizes` says. */
function boundsOf(spots, keys, sizes = new Map()) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const k of keys) {
    const [x, y] = spots.get(k),
      [w, h] = sizes.get(k) ?? [120, 40];
    [x0, y0, x1, y1] = [
      Math.min(x0, x - w / 2),
      Math.min(y0, y - h / 2),
      Math.max(x1, x + w / 2),
      Math.max(y1, y + h / 2),
    ];
  }
  return [x0, y0, x1, y1];
}
const apart = ([a0, b0, a1, b1], [c0, d0, c1, d1]) => a1 <= c0 || c1 <= a0 || b1 <= d0 || d1 <= b0;

describe('the parts of a graph', () => {
  test('are what links or a group join, the largest first, each in the order given', () => {
    const keys = ['a', 'b', 'c', 'd', 'e', 'f'];
    assert.deepEqual(
      partsOf(keys, [
        { from: 'e', to: 'b' },
        { from: 'f', to: 'd' },
      ]),
      [['b', 'e'], ['d', 'f'], ['a'], ['c']],
    );
    assert.deepEqual(partsOf(keys, [{ from: 'e', to: 'b' }], [['a', 'c', 'f']]), [['a', 'c', 'f'], ['b', 'e'], ['d']]);
  });

  test('pack in rows to about a screen’s shape, none on another', () => {
    const sizes = Array.from({ length: 12 }, () => [100, 100]);
    const at = packed(sizes, 10);
    const width = Math.max(...at.map(([x]) => x)) + 100,
      height = Math.max(...at.map(([, y]) => y)) + 100;
    assert.ok(width / height > 1 && width / height < SCREEN * 2, `${width} by ${height}`);
    for (let i = 0; i < at.length; i++)
      for (let j = i + 1; j < at.length; j++)
        assert.ok(apart([...at[i], at[i][0] + 100, at[i][1] + 100], [...at[j], at[j][0] + 100, at[j][1] + 100]));
  });

  test('with no link go in a tray by name', () => {
    const sizes = new Map(['zebra', 'apple', 'mango'].map((k) => [k, [100, 40]]));
    const { spots } = trayOf(['zebra', 'apple', 'mango'], sizes, (k) => k, 10);
    const order = [...spots.entries()].sort(([, p], [, q]) => p[1] - q[1] || p[0] - q[0]).map(([k]) => k);
    assert.deepEqual(order, ['apple', 'mango', 'zebra']);
  });
});

describe('a drawing of several parts', () => {
  // proves: layout_parts_packed
  test('lays each part out on its own, packs them clear of each other to a screen’s shape, loose things by name', () => {
    const { spots } = ownSpots(laid(MARKS), 'LR');
    const alone = ownSpots(laid(MARKS.filter((m) => FLOW.includes(m.of) || FLOW.includes(m.from)))).spots;
    // the flow is laid out as if drawn alone: each thing the same way from its first
    const [ax, ay] = alone.get('f1'),
      [bx, by] = spots.get('f1');
    for (const k of FLOW) {
      assert.ok(Math.abs(spots.get(k)[0] - bx - (alone.get(k)[0] - ax)) < 1e-6, `${k} across`);
      assert.ok(Math.abs(spots.get(k)[1] - by - (alone.get(k)[1] - ay)) < 1e-6, `${k} down`);
    }
    const flow = boundsOf(spots, FLOW),
      pair = boundsOf(spots, ['p1', 'p2']),
      tray = boundsOf(spots, ['apple', 'mango', 'zebra']);
    assert.ok(apart(flow, pair) && apart(flow, tray) && apart(pair, tray), 'no part sits on another');
    const all = boundsOf(spots, [...spots.keys()]);
    const shape = (all[2] - all[0]) / (all[3] - all[1]);
    assert.ok(shape > SCREEN / 2 && shape < SCREEN * 2, `within 1:2 of a screen, not ${shape.toFixed(2)}`);
    const reading = ['apple', 'mango', 'zebra'].map((k) => spots.get(k));
    for (let i = 1; i < reading.length; i++)
      assert.ok(
        reading[i][1] > reading[i - 1][1] + 1e-6 || reading[i][0] > reading[i - 1][0],
        'the tray reads by name, across then down',
      );
  });

  test('of one part is laid out as before', () => {
    const one = MARKS.filter((m) => FLOW.includes(m.of) || FLOW.includes(m.from));
    const { spots, pick } = ownSpots(laid(one), 'LR');
    assert.equal(spots.size, FLOW.length);
    assert.equal(pick.layout, 'layered');
  });

  // proves: layout_parts_packed
  test('in space packs its parts the same way, the largest kept where it was, each thing’s depth kept', () => {
    const shape = {
      things: ['a', 'b', 'c', 'x', 'y', 'm', 'k'].map((key) => ({ key, text: key, kinds: [] })),
      links: [
        ['a', 'b'],
        ['b', 'c'],
        ['x', 'y'],
      ].map(([from, to]) => ({ from, type: '', to })),
    };
    // the force layout left the pair and the loose things far off
    const spots = new Map([
      ['a', [0, 0, 0.2]],
      ['b', [1, 0, -0.2]],
      ['c', [2, 0, 0]],
      ['x', [40, 30, 0.5]],
      ['y', [41, 30, 0.5]],
      ['m', [-50, 9, 1]],
      ['k', [70, -60, -1]],
    ]);
    const out = partsNear(shape, spots);
    for (const k of ['a', 'b', 'c']) assert.deepEqual(out.get(k), spots.get(k), `${k} stays`);
    for (const [k, p] of out) {
      assert.equal(p[2], spots.get(k)[2], `${k} keeps its depth`);
      assert.ok(Math.hypot(p[0] - 1, p[1]) < 6, `${k} is packed near the rest`);
    }
    for (const [p, q] of [
      ['a', 'x'],
      ['c', 'k'],
      ['x', 'm'],
    ])
      assert.ok(Math.hypot(out.get(p)[0] - out.get(q)[0], out.get(p)[1] - out.get(q)[1]) >= 1 - 1e-6, `${p} ${q}`);
  });
});
