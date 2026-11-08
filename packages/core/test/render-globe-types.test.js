// Every diagram type the stage draws wraps round the ball as the globe spins (editor spec ES§71, globe_view; Roger,
// 8 Nov 2026: "the projection never wraps around to the other side"). What is round the back is out of sight, and what
// comes round is drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAID_TYPES, laidOf } from '../src/render/render-laid.ts';
import { sceneOf } from '../src/render/render-scene.ts';
import { detailAt, roomSizes } from '../src/render/render-detail.ts';
import { LIGHT } from '../src/render/render-look.ts';
import { marksOf, onScreen } from '../src/render/render-marks.ts';
import { fitView } from '../src/render/render-camera.ts';
import { bendOf } from '../src/render/render-globe.ts';

const thing = (key) => ({ key, text: `Thing ${key}`, kinds: ['Item'], texts: new Map() });
const keys = Array.from({ length: 24 }, (_, i) => `T${i}`);
const links = keys.slice(1).map((k, i) => ({ from: keys[(i * 3) % (i + 1)], to: k, type: 'RELATES' }));
const shape = { things: keys.map(thing), links };

for (const type of LAID_TYPES) {
  test(`${type} wraps round the ball: the far side hides, and a spin brings it round`, () => {
    const scene0 = sceneOf(shape);
    const { scene, spots } = laidOf(type, shape, scene0);
    const sizes = roomSizes(scene, spots);
    const fit = fitView(spots.values(), 1000, 800);
    const view = { ...fit, globe: bendOf(spots.values()) };
    const shown = (v) =>
      marksOf(scene, spots, detailAt(sizes, v.scale), LIGHT, v).filter((m) => m.kind === 'dot' || m.kind === 'cloud');
    const keysSeen = (v) => new Set(shown(v).map((m) => m.key));
    for (const m of shown(view)) assert.ok(Number.isFinite(m.x) && Number.isFinite(m.y), `${type} ${m.key}`);
    // spin to one side. What is behind is not drawn. What was hidden before may come into sight.
    // what a type draws round its things bends with the ball too: tiles follow it, and none is flat or finite-less
    const round = marksOf(scene, spots, detailAt(sizes, view.scale), LIGHT, view).filter((m) => m.kind === 'backdrop');
    for (const b of round)
      for (const t of b.tiles) assert.ok(t.poly && t.poly.every(([x, y]) => Number.isFinite(x + y)), `${type} tile`);
    const first = keysSeen(view);
    const step = (fit.w / fit.scale) * 0.9;
    const spun = { ...view, x: view.x + step };
    const behind = [...spots].filter(([, s]) => onScreen(s, spun).behind).map(([k]) => k);
    const now = keysSeen(spun);
    for (const k of behind) assert.ok(!now.has(k), `${type}: ${k} is round the back`);
    assert.ok([...now].some((k) => !first.has(k)) || behind.length > 0, `${type}: a spin changes what is in sight`);
  });
}
