// The new rendering shows what the card is untangled to (editor spec §25, untangle_legend, untangle_ask_filter). A group
// or item with nothing kept fades, and its item names go; a group's name stays. What is all hidden is not drawn, nor
// the roads to it. With nothing untangled, the marks are as they were.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNTANGLE_FADE, untangledMarks, untangles } from '../src/render/render-untangle.ts';

const node = (key, depth, items, parent) => ({ key, name: key, depth, children: [], items, ...(parent && { parent }) });
const SCENE = {
  depths: ['Owner', 'Item'],
  nodes: new Map([
    ['sam', node('sam', 0, ['r1', 'r2'])],
    ['ana', node('ana', 0, ['r3'])],
    ['r1', node('r1', 1, ['r1'], 'sam')],
    ['r2', node('r2', 1, ['r2'], 'sam')],
    ['r3', node('r3', 1, ['r3'], 'ana')],
  ]),
  roots: ['sam', 'ana'],
  named: ['sam', 'ana'],
  roads: [[], []],
};
const cloud = (key) => ({ kind: 'cloud', key, x: 0, y: 0, r: 10, fill: '#000', alpha: 1, pick: true });
const dot = (key) => ({ kind: 'dot', key, x: 0, y: 0, r: 2, fill: '#000', alpha: 1, pick: true });
const label = (key) => ({ kind: 'label', key, text: key, x: 0, y: 0, w: 1, h: 1, px: 12, fill: '', ink: '', alpha: 1 });
const road = (a, b) => ({
  kind: 'road',
  a,
  b,
  from: [0, 0],
  to: [1, 1],
  forward: 1,
  back: 0,
  width: 1,
  fill: '',
  count: '',
  ink: '',
  chip: '',
  alpha: 1,
});
const MARKS = [
  cloud('sam'),
  cloud('ana'),
  road('sam', 'ana'),
  dot('r1'),
  dot('r2'),
  dot('r3'),
  label('sam'),
  label('ana'),
  label('r1'),
  label('r2'),
];
const said = (marks) => marks.map((m) => `${m.kind}:${m.key ?? `${m.a}-${m.b}`}:${m.alpha}`);

test('nothing untangled changes nothing', () => {
  assert.equal(untangles(null), false);
  assert.equal(untangles({ kept: null, hidden: new Set() }), false);
});

test('what is kept stays; the rest fades, and an item faded loses its name, a group keeps it', () => {
  const out = untangledMarks(MARKS, SCENE, { kept: new Set(['r1']), hidden: new Set() });
  const f = String(UNTANGLE_FADE);
  assert.deepEqual(said(out), [
    'cloud:sam:1',
    `cloud:ana:${f}`,
    `road:sam-ana:${f}`,
    'dot:r1:1',
    `dot:r2:${f}`,
    `dot:r3:${f}`,
    'label:sam:1',
    'label:ana:1',
    'label:r1:1',
  ]);
  assert.equal(out.find((m) => m.key === 'r2').pick, false, 'a faded thing is not picked');
});

test('what is all hidden is not drawn, nor the roads to it', () => {
  const out = untangledMarks(MARKS, SCENE, { kept: null, hidden: new Set(['r3']) });
  assert.deepEqual(
    said(out).filter((s) => /ana|r3/.test(s)),
    [],
  );
  assert.equal(out.find((m) => m.key === 'sam').alpha, 1, 'nothing fades when nothing is brought forward');
});

// proves: ai_query_highlight
test('ai_query_highlight: the stage marks what a highlight finds by its badge and colour, fades nothing, moves nothing', async () => {
  const { QUERY_MARKS } = await import('../src/filter.ts');
  const { markedBy, queryLine } = await import('../src/query-marks.ts');
  const { PALETTES } = await import('../src/palette.ts');
  const layers = { kept: null, hidden: new Set(), marked: markedBy(['r1'], QUERY_MARKS[0]) };
  assert.ok(untangles(layers), 'a highlight alone is drawn');
  const before = structuredClone(MARKS);
  for (const p of [PALETTES.light, PALETTES.dark]) {
    const out = untangledMarks(MARKS, SCENE, layers, p);
    const line = queryLine('blue', p);
    assert.equal(out.length, MARKS.length, 'nothing hidden');
    assert.ok(
      out.every((m) => m.alpha === 1),
      'nothing faded',
    );
    const of = (kind, key) => out.find((m) => m.kind === kind && m.key === key);
    assert.equal(of('label', 'r1').text, '⚑ r1', 'the badge on its name');
    assert.equal(of('label', 'r1').edge, line, 'its card edged in the colour');
    assert.equal(of('dot', 'r1').ring, line, 'its dot ringed in the colour');
    assert.equal(of('label', 'sam').text, '⚑ sam', 'the group holding it is marked too');
    assert.equal(of('label', 'r2').text, 'r2', 'a thing not found is as it was');
    assert.equal(of('label', 'ana').text, 'ana');
    for (const [i, m] of out.entries())
      assert.deepEqual([m.x, m.y, m.r, m.w, m.h], [before[i].x, before[i].y, before[i].r, before[i].w, before[i].h]);
  }
  assert.deepEqual(MARKS, before, 'the marks given are untouched');
});
