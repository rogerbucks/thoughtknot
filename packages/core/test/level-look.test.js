// How the levels of detail look in 2D (editor spec §68, level_look, level_regions): level-look.ts. A cloud is one
// puff round each thing, solid in the middle and fading at its edge, with no outline. A subject's region is wider. Far out
// each thing is a dot. A cloud's name sits on a card with its count. Each keeps its size on screen at any zoom.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

let uninstall, look;
before(async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  uninstall = installGlobals(fakeDocument(800));
  look = await import('../src/display/graph-view/level-look.ts');
});
after(() => uninstall());

const rects = [
  { left: 0, top: 0, right: 20, bottom: 10 },
  { left: 40, top: 30, right: 60, bottom: 50 },
];

// proves: level_look
test('a cloud is one puff round each thing in its hue, solid then fading, never blurred into a smear', () => {
  const g = look.puffs(rects, 6, 2);
  assert.equal(g.getAttribute('class'), 'thoughtknot-cloud');
  assert.equal(g.getAttribute('filter'), null, 'no blur: the mockup’s clear shape (Roger, 5 Nov 2026)');
  assert.equal(g.getAttribute('data-hue'), '2');
  assert.ok(g.children.every((c) => c.getAttribute('fill') === `url(#${look.CLOUD_FILL}-2)`));
  assert.equal(g.children.length, 2, 'a puff each');
  assert.ok(Number(g.children[0].getAttribute('r')) > 10, 'each puff reaches past its thing by the pad');
});

// proves: level_regions
test('a region is a wider faint shape in its subject’s colour, with no blur', () => {
  const g = look.region(rects, 60, 3);
  assert.equal(g.getAttribute('class'), 'thoughtknot-region');
  assert.equal(g.getAttribute('filter'), null);
  assert.ok(g.children.every((c) => c.getAttribute('fill') === `url(#${look.CLOUD_FILL}-3)`));
  assert.equal(g.getAttribute('data-hue'), '3');
  assert.ok(Number(g.children[0].getAttribute('r')) > Number(look.puffs(rects, 6).children[0].getAttribute('r')));
});

test('far out, each thing is a dot that keeps its size on screen', () => {
  const near = look.dots(rects, 1),
    far = look.dots(rects, 0.25);
  assert.equal(near.children.length, 2);
  assert.ok(Number(far.children[0].getAttribute('r')) > Number(near.children[0].getAttribute('r')), 'larger in units');
});

test('a cloud’s card holds its name and its count', () => {
  const g = look.card(100, 50, 'Money', '42 things', 1);
  assert.equal(g.getAttribute('class'), 'thoughtknot-cloud-card-svg');
  const texts = g.children.filter((c) => c.tagName.toLowerCase() === 'text').map((t) => t.textContent);
  assert.deepEqual(texts, ['Money', '42 things']);
});

test('each hue’s fill is put in the drawing’s defs once: solid in the middle, faded out at the edge', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  look.cloudFills(svg);
  look.cloudFills(svg);
  const defs = svg.children.find((c) => c.tagName.toLowerCase() === 'defs');
  const ids = defs.children.map((f) => f.getAttribute('id'));
  assert.deepEqual(
    ids,
    [0, 1, 2, 3, 4, 5].map((h) => `${look.CLOUD_FILL}-${h}`),
  );
  const stops = defs.children[1].children.map((s) => [s.getAttribute('stop-opacity'), s.getAttribute('data-hue')]);
  assert.deepEqual(stops, [
    ['1', '1'],
    ['0.9', '1'],
    ['0', '1'],
  ]);
});

// proves: level_look
test('zoomed in, a cloud stays one shape: each puff reaches past halfway to its usual neighbour', () => {
  const spread = [0, 100, 200, 300].map((x) => ({ left: x, top: 0, right: x + 4, bottom: 4 }));
  assert.equal(look.spacing(spread), 100);
  const g = look.puffs(spread, 2, 0);
  assert.ok(Number(g.children[0].getAttribute('r')) * 2 > 100, 'neighbours overlap, so no polka dots');
  assert.equal(look.spacing(spread.slice(0, 1)), 0, 'a lone thing has no neighbour');
});
