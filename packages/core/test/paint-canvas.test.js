// The canvas painter, layer L5 of the rendering spec (editor spec §73, render_painters_agree): render/paint-canvas.ts.
// It draws the marks exactly as given: every colour, place and name it uses comes from a mark.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paintCanvas } from '../src/render/paint-canvas.ts';

/** A fake 2D canvas that writes down every call and every colour and font it is given. */
function fake() {
  const calls = [];
  const said = { fill: [], stroke: [], font: [], text: [] };
  const c = {
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: 'butt',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    set fillStyle(v) {
      if (typeof v === 'string') said.fill.push(v);
    },
    set strokeStyle(v) {
      said.stroke.push(v);
    },
    set font(v) {
      said.font.push(v);
    },
    createRadialGradient: () => ({ addColorStop: (_, colour) => said.fill.push(colour) }),
  };
  for (const name of ['clearRect', 'beginPath', 'arc', 'moveTo', 'lineTo', 'roundRect', 'fill', 'stroke'])
    c[name] = (...args) => calls.push([name, ...args]);
  c.fillText = (text, x, y) => {
    said.text.push(text);
    calls.push(['fillText', text, x, y]);
  };
  return { c, calls, said };
}

const marks = [
  { kind: 'cloud', key: 'w', x: 100, y: 100, r: 80, fill: '#4b7bf5', alpha: 0.4 },
  {
    kind: 'road',
    a: 'w',
    b: 'm',
    from: [100, 100],
    to: [300, 100],
    forward: 2,
    back: 1,
    width: 3,
    fill: '#4b7bf5',
    count: '2 ⇄ 1',
    ink: '#000000',
    alpha: 1,
  },
  { kind: 'dot', key: 'x', x: 90, y: 90, r: 3, fill: '#f2793a', alpha: 0.8 },
  {
    kind: 'label',
    key: 'w',
    text: 'Work',
    x: 80,
    y: 90,
    w: 40,
    h: 20,
    px: 12,
    fill: '#4b7bf5',
    ink: '#ffffff',
    alpha: 1,
  },
];

// proves: render_painters_agree
test('the painter clears the canvas, then draws each mark in the order given', () => {
  const { c, calls } = fake();
  paintCanvas(c, marks, 400, 300);
  assert.deepEqual(calls[0], ['clearRect', 0, 0, 400, 300]);
  const drawn = calls.filter(([n]) => n === 'arc' || n === 'lineTo' || n === 'fillText').map(([n, a]) => [n, a]);
  assert.deepEqual(drawn, [
    ['arc', 100],
    ['lineTo', 300],
    ['fillText', '2 ⇄ 1'],
    ['arc', 90],
    ['fillText', 'Work'],
  ]);
});

// proves: render_painters_agree
test('every colour and size it uses comes from the marks', () => {
  const { c, said } = fake();
  paintCanvas(c, marks, 400, 300);
  const given = new Set(['#4b7bf5', '#f2793a', '#000000', '#ffffff']);
  for (const colour of said.fill.concat(said.stroke)) {
    const hex = colour.startsWith('rgba')
      ? '#' +
        colour
          .slice(5, -1)
          .split(',')
          .slice(0, 3)
          .map((n) => Number(n).toString(16).padStart(2, '0'))
          .join('')
      : colour;
    assert.ok(given.has(hex), `${colour} was not given`);
  }
  assert.ok(said.font.includes('600 12px system-ui, sans-serif'));
});
