// The curve of a direct link (editor spec §25, untangle_direct): direct-curve.ts. A link cut short of its arrowhead is
// drawn as a cubic on the curve itself. So its words and crossing checks sit where the line is drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curveOf } from '../src/direct-curve.ts';

test('the cubic drawn for a link cut short of its arrowhead lies on the curve itself', () => {
  const a = { key: 'a', x: 0, y: 0, hw: 20, hh: 10 },
    b = { key: 'b', x: 300, y: 120, hw: 20, hh: 10 };
  const curve = curveOf(a, b, 0.3),
    cubic = curve.cubic(0, 10);
  const bezier = (t) => {
    const u = 1 - t,
      [p0, p1, p2, p3] = cubic;
    return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
  };
  const onCurve = Array.from({ length: 2001 }, (_, k) => curve.at(k / 2000));
  const off = (p) => Math.min(...onCurve.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])));
  for (let k = 0; k <= 40; k++) assert.ok(off(bezier(k / 40)) < 0.2, `point ${k} of the cubic is on the curve`);
  const [tip] = curve.tipAt(false);
  assert.ok(Math.abs(Math.hypot(cubic[3][0] - tip[0], cubic[3][1] - tip[1]) - 10) < 1e-6, 'it ends the head short');
});
