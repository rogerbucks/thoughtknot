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
    chip: '#ffffff',
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

// proves: render_painters_agree
test('an item card gets its dot and a thin edge in the dot’s colour, and its name moves past the dot', () => {
  const { c, calls, said } = fake();
  const card = {
    ...marks[3],
    key: 'i',
    text: 'Item',
    fill: '#ffffff',
    ink: '#18202c',
    dot: '#2fb37a',
    edge: '#2fb37a',
  };
  paintCanvas(c, [card], 400, 300);
  assert.ok(said.stroke.includes('#2fb37a'));
  assert.deepEqual(
    calls.filter(([n]) => n === 'arc').map(([, x]) => x),
    [80 + 10],
  );
  const [, , x] = calls.find(([n]) => n === 'fillText');
  assert.ok(x > 80 + 20, 'the name sits after the dot');
});

// proves: render_look_in_marks
test('a group card writes its name in its colour, with how many items it holds on a second, smaller line', () => {
  const { c, calls, said } = fake();
  const card = {
    ...marks[3],
    h: 34,
    fill: '#ffffff',
    ink: '#2a5bd8',
    edge: '#4b7bf5',
    sub: '13 items',
    subPx: 11,
    subInk: '#8a8f99',
  };
  paintCanvas(c, [card], 400, 300);
  assert.ok(said.stroke.includes('#4b7bf5'), 'edged in its colour');
  const texts = calls.filter(([n]) => n === 'fillText');
  assert.deepEqual(
    texts.map(([, t]) => t),
    ['Work', '13 items'],
  );
  assert.ok(texts[1][3] > texts[0][3], 'the count sits under the name');
  assert.ok(said.font.includes('500 11px system-ui, sans-serif'));
  assert.ok(said.fill.includes('#2a5bd8') && said.fill.includes('#8a8f99'));
});

// proves: render_painters_agree
test('a card that stands away from its thing is joined to it by a thin line in its colour, ending in a dot', () => {
  const { c, calls, said } = fake();
  const card = { kind: 'label', key: 'w', text: 'Work', x: 10, y: 10, w: 60, h: 20, px: 13, fill: '#ffffff' };
  paintCanvas(c, [{ ...card, ink: '#000000', alpha: 1, edge: '#4b7bf5', lead: [70, 20, 140, 60] }], 400, 300);
  assert.deepEqual(
    calls.find((k) => k[0] === 'moveTo'),
    ['moveTo', 70, 20],
  );
  assert.deepEqual(
    calls.find((k) => k[0] === 'lineTo'),
    ['lineTo', 140, 60],
  );
  assert.ok(
    calls.some((k) => k[0] === 'arc' && k[1] === 140 && k[2] === 60),
    'a dot where it meets the thing',
  );
  assert.ok(said.stroke.includes('#4b7bf5'));
});

// Roger, 7 Nov 2026: a cluster's edge should be clearly defined, not fade out when zoomed in.
// proves: render_painters_agree
test('a cloud with a ring is edged with a line in its own colour, just inside its edge', () => {
  const { c, calls, said } = fake();
  paintCanvas(c, [{ ...marks[0], ring: 0.55 }], 400, 300);
  const arcs = calls.filter((k) => k[0] === 'arc');
  assert.equal(arcs.length, 2, 'its fill and its edge');
  assert.equal(arcs[1][3], 79, 'the edge just inside the cloud');
  assert.ok(calls.some((k) => k[0] === 'stroke'));
  assert.ok(said.stroke.includes('#4b7bf5'), "the edge is the cloud's own colour");
  const { c: plain, calls: none } = fake();
  paintCanvas(plain, [{ ...marks[0], ring: 0 }], 400, 300);
  assert.equal(none.filter((k) => k[0] === 'stroke').length, 0, 'no ring, no edge');
});
