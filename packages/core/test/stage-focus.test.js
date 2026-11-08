// The stage's focus (editor spec §73, render_focus, hover_calm): display/graph-view/stage-focus.ts. A chosen thing is
// in focus at once. A hovered one waits until the pointer rests, and a thing only crossed is marked faintly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneOf } from '../src/render/render-scene.ts';
import { roomsOf } from '../src/render/render-rooms.ts';
import { detailAt, roomSizes } from '../src/render/render-detail.ts';
import { fitView } from '../src/render/render-camera.ts';
import { LIGHT } from '../src/render/render-look.ts';
import { marksOf } from '../src/render/render-marks.ts';
import { CROSSING, HOVER_MS, LEAVE_MS, StageFocus } from '../src/display/graph-view/stage-focus.ts';

const thing = (key, names = {}) => ({
  key,
  text: `Thing ${key}`,
  kinds: ['Item'],
  texts: new Map(Object.entries(names)),
});
const link = (from, to) => ({ from, to, type: 'RELATES' });

/** Three subjects of two areas each, Work linked to Money and Home, and Money to Home. */
function world() {
  const things = [];
  for (const subject of ['Work', 'Money', 'Home'])
    for (const area of ['A', 'B'])
      for (let i = 0; i < 8; i++) things.push(thing(`${subject[0]}${area}${i}`, { subject, area }));
  const links = [link('WA0', 'MA0'), link('MA1', 'WB1'), link('HA0', 'WA2'), link('MA2', 'HA3')];
  const scene = sceneOf({ things, links });
  const spots = roomsOf(scene);
  return { scene, spots, sizes: roomSizes(scene, spots) };
}

// Roger, 7 Nov 2026: on hover, after a short time; on select, at once.
// proves: render_focus
test('a hover shows its focus only after a short wait, a choice shows at once, and leaving clears it', () => {
  const timers = [];
  const clock = {
    setTimeout: (run, ms) => timers.push({ run, ms }) - 1,
    clearTimeout: (id) => (timers[id].run = null),
  };
  let drawn = 0;
  const focus = new StageFocus(() => drawn++, clock);
  assert.deepEqual(focus.of('a').keys, ['a'], 'a chosen thing is in focus at once');
  focus.hover('b');
  assert.deepEqual(focus.of(null).keys, [], 'a hovered thing waits');
  assert.equal(timers.at(-1).ms, HOVER_MS);
  focus.hover('c'); // the pointer moved on before the wait was over: only the last thing shows
  assert.equal(timers[0].run, null, 'the first wait is called off');
  const before = drawn;
  timers.at(-1).run();
  assert.deepEqual(focus.of('a').keys, ['a', 'c']);
  assert.equal(drawn, before + 1, 'drawn again once it shows');
  focus.hover(null);
  assert.deepEqual(focus.of(null).keys, ['c'], 'leaving, it stays a moment, so a gap crossed does not flicker');
  assert.equal(timers.at(-1).ms, LEAVE_MS);
  timers.at(-1).run();
  assert.deepEqual(focus.of(null).keys, [], 'then it clears');
  assert.ok(focus.choose({ a: 'x', b: 'y' }));
  assert.deepEqual(focus.of(null).road, { a: 'x', b: 'y' });
  assert.equal(focus.choose(null), false);
  assert.equal(focus.of(null).road, undefined);
});

// Roger, 8 Nov 2026: crossing things only marks them faintly; their links show once the pointer rests.
// proves: hover_calm
test('a thing the pointer crosses is marked faintly at once, and its links show only once the pointer rests on it', () => {
  const timers = [];
  const clock = {
    setTimeout: (run, ms) => timers.push({ run, ms }) - 1,
    clearTimeout: (id) => (timers[id].run = null),
  };
  const focus = new StageFocus(() => {}, clock);
  assert.ok(CROSSING > 0);
  focus.hover('b', true);
  assert.equal(focus.of(null).near, 'b', 'marked faintly at once');
  assert.deepEqual(focus.of(null).keys, [], 'its links wait');
  const first = timers.length - 1;
  focus.hover('b', true); // still crossing it fast: the wait starts again
  assert.equal(timers[first].run, null, 'a pointer still crossing has not rested');
  focus.hover('b'); // slowed on it: the wait already under way goes on
  const rest = timers.length - 1;
  timers[rest].run();
  assert.deepEqual(focus.of(null).keys, ['b'], 'rested, its links show');
  assert.equal(focus.of(null).near, undefined, 'and it is no longer only near');
  // the faint mark: its dot ringed in its own colour, nothing else changed
  const { scene, spots, sizes } = world();
  const view = fitView(spots.values(), 1280, 800);
  const plain = marksOf(scene, spots, detailAt(sizes, view.scale), LIGHT, view);
  const dot = plain.find((m) => m.kind === 'dot');
  const near = marksOf(scene, spots, detailAt(sizes, view.scale), LIGHT, view, undefined, { keys: [], near: dot.key });
  assert.equal(near.find((m) => m.kind === 'dot' && m.key === dot.key).ring, dot.fill);
  const others = (ms) => ms.filter((m) => !(m.kind === 'dot' && m.key === dot.key));
  assert.deepEqual(others(near), others(plain), 'every other mark is as it was');
});
