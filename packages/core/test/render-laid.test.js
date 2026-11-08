// Places for diagram types other than Network on the new stage (editor spec §73, render_every_type):
// render/render-laid.ts. Each type keeps its own layout, the same graph always gives the same places, and no two
// things sit on one spot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAID_TYPES, isLaid, placesOf } from '../src/render/render-laid.ts';
import { ITEM_GAP } from '../src/render/render-rooms.ts';

const thing = (key) => ({ key, text: `Thing ${key}`, kinds: ['Item'], texts: new Map() });
const link = (from, to) => ({ from, to, type: 'RELATES' });

/** A small tree under A, a loop B-E-F, and one thing on its own. */
function shape() {
  const keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const links = [link('A', 'B'), link('A', 'C'), link('B', 'D'), link('B', 'E'), link('C', 'F'), link('E', 'F')];
  return { things: keys.map(thing), links };
}

const apart = (places) => {
  const list = [...places.values()];
  let least = Infinity;
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++)
      least = Math.min(least, Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y));
  return least;
};

for (const type of LAID_TYPES) {
  test(`${type} places every thing, apart, the same each time`, () => {
    const a = placesOf(type, shape()),
      b = placesOf(type, shape());
    assert.equal(a.size, 8);
    assert.deepEqual([...a], [...b]);
    assert.ok(apart(a) >= ITEM_GAP, `${type}: two things closer than a dot`);
    for (const p of a.values()) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  });
}

test('radial puts the busiest thing in the middle and its links on the first ring', () => {
  const p = placesOf('radial', shape());
  const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((k) => p.get(k));
  // B links to A, D and E: the busiest
  const r = (q) => Math.hypot(q.x - b.x, q.y - b.y);
  assert.ok(r(a) > 0 && Math.abs(r(a) - r(d)) < 1e-6, 'A and D share the first ring round B');
  assert.ok(r(c) > r(a), 'C is a ring further out');
});

test('tree puts each child in a row under its parent', () => {
  const p = placesOf('tree', { things: ['A', 'B', 'C'].map(thing), links: [link('A', 'B'), link('A', 'C')] });
  assert.ok(p.get('B').y > p.get('A').y && p.get('B').y === p.get('C').y);
});

test('isLaid knows only its own types', () => {
  assert.ok(isLaid('force') && isLaid('tree') && !isLaid('network') && !isLaid('ego'));
});

test('laidOf gives one level holding every thing, a spot for each, and roads among them', async () => {
  const { laidOf } = await import('../src/render/render-laid.ts');
  const { sceneOf } = await import('../src/render/render-scene.ts');
  const s = shape();
  const laid = laidOf('radial', s, sceneOf(s));
  assert.equal(laid.scene.nodes.size, 8);
  assert.equal(laid.spots.size, 8);
  assert.equal(laid.scene.roads[0].length, 6);
});

test("laidOf puts each subject's things on one patch, and the patch shows as an area mark", async () => {
  const { laidOf } = await import('../src/render/render-laid.ts');
  const { sceneOf } = await import('../src/render/render-scene.ts');
  const { areasOf } = await import('../src/render/render-areas.ts');
  const { LIGHT } = await import('../src/render/render-look.ts');
  const named = (key, subject) => ({ ...thing(key), texts: new Map([['subject', subject]]) });
  const s = {
    things: [named('A', 'Work'), named('B', 'Work'), named('C', 'Home')],
    links: [link('A', 'B'), link('B', 'C')],
  };
  const laid = laidOf('force', s, sceneOf(s));
  const areas = laid.scene.areas.map((a) => [a.items.sort().join(''), a.reach > 0]);
  assert.deepEqual(areas.sort(), [
    ['AB', true],
    ['C', true],
  ]);
  const view = { x: -500, y: -500, scale: 1, w: 1000, h: 1000 };
  const marks = areasOf(
    laid.scene.areas,
    laid.spots,
    view,
    new Map([
      ['A', '#3366cc'],
      ['C', '#cc6633'],
    ]),
    LIGHT,
  );
  assert.equal(marks.length, 2);
  assert.ok(marks.every((m) => m.kind === 'area' && m.blobs.every((b) => b.r > 0)));
});

// Matrix, Density and Plan keep their own drawing as the stage's backdrop (render_cells_timeline).
test('matrix puts each thing on its own cell, where its row crosses its column', () => {
  const p = placesOf('matrix', shape());
  assert.equal(p.size, 8);
  for (const q of p.values()) assert.ok(Math.abs(q.x - q.y) < 1, 'a thing off the diagonal');
});

test('density puts each thing inside a shaded square, so zooming in shows the things a square counts', async () => {
  const { laidOf } = await import('../src/render/render-laid.ts');
  const { sceneOf } = await import('../src/render/render-scene.ts');
  const s = shape();
  const laid = laidOf('density', s, sceneOf(s));
  const squares = laid.scene.backdrop.marks.filter((m) => m.kind === 'box' && m.id.startsWith('square'));
  for (const [k, q] of laid.spots) {
    const inside = squares.some((m) => q.x >= m.x && q.x <= m.x + m.width && q.y >= m.y && q.y <= m.y + m.height);
    assert.ok(inside, `${k} is not in any square`);
  }
});

test('plan puts a thing with dates on its bar, and one with none at its prompt', async () => {
  const { laidOf } = await import('../src/render/render-laid.ts');
  const { sceneOf } = await import('../src/render/render-scene.ts');
  const dated = (key, day) => ({
    ...thing(key),
    kinds: ['Task'],
    date: `2026-01-0${day}`,
    dates: new Map([
      ['start', `2026-01-0${day}`],
      ['end', `2026-01-1${day}`],
    ]),
  });
  const s = { things: [dated('A', 1), dated('B', 2), { ...thing('C'), kinds: ['Task'] }], links: [link('A', 'B')] };
  const laid = laidOf('plan', s, sceneOf(s));
  const bars = laid.scene.backdrop.marks.filter((m) => m.kind === 'box' && m.style === 'bar');
  assert.equal(bars.length, 2);
  for (const b of bars) {
    const q = laid.spots.get(b.of);
    assert.ok(q.x > b.x && q.x < b.x + b.width && q.y > b.y && q.y < b.y + b.height, `${b.of} is off its bar`);
  }
  assert.ok(laid.spots.has('C'), 'a thing with no dates is left out');
});
