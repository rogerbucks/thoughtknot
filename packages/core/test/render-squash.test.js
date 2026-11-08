// Round things on the globe turn from you like a coin on a table (editor spec §71, globe_view; Roger, 8 Nov 2026):
// rooms become ovals and names narrow as the ball spins them toward its edge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squashAt } from '../src/render/render-squash.ts';
import { paintCanvas } from '../src/render/paint-canvas.ts';

const view = { x: 0, y: 0, scale: 1, w: 1000, h: 800, globe: 0.002 };

// proves: globe_view
test('a thing in the middle of the ball is not squeezed, one toward the edge is, along the way to the middle', () => {
  assert.equal(squashAt(500, 400, view), undefined, 'the middle faces you');
  assert.equal(squashAt(900, 400, { ...view, globe: 0 }), undefined, 'a flat view squeezes nothing');
  const [angle, k] = squashAt(500 + 400, 400, view);
  assert.ok(Math.abs(angle) < 1e-9, 'squeezed along the way to the middle');
  assert.ok(k > 0.3 && k < 0.7, `it narrows toward the edge: ${k}`);
  const [, nearer] = squashAt(500 + 200, 400, view);
  assert.ok(nearer > k, 'the further round, the narrower');
});

// proves: globe_view
test('the painter turns a squeezed cloud and name about their middles, and puts the canvas back', () => {
  const calls = [];
  const c = new Proxy(
    { createRadialGradient: () => ({ addColorStop() {} }) },
    { get: (o, k) => o[k] ?? ((...a) => calls.push([k, ...a])), set: () => true },
  );
  const cloud = { kind: 'cloud', key: 'a', x: 700, y: 100, r: 50, fill: '#4b7bf5', alpha: 0.3, squash: [0.5, 0.6] };
  const label = {
    kind: 'label',
    key: 'a',
    text: 'A',
    x: 600,
    y: 80,
    w: 40,
    h: 20,
    px: 12,
    fill: '#fff',
    ink: '#000',
    alpha: 1,
    squash: [0.5, 0.6],
  };
  paintCanvas(c, [cloud, label], 1000, 800);
  const names = calls.map(([k]) => k);
  assert.equal(names.filter((k) => k === 'save').length, 2);
  assert.equal(names.filter((k) => k === 'restore').length, 2, 'each squeeze is undone');
  assert.deepEqual(calls.find(([k]) => k === 'scale').slice(1), [0.6, 1]);
  assert.equal(names.filter((k) => k === 'rotate').length, 3, 'the name leans back upright, the cloud stays turned');
});
