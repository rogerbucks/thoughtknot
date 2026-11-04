// How the levels of detail look in 2D (editor spec §68, level_look, level_regions): level-look.ts. A cloud is one
// blurred puff round each thing, with no outline. A subject's region is a wider blurred wash in its colour. Far out
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
test('a cloud is one blurred puff round each thing, with no outline', () => {
  const g = look.puffs(rects, 6);
  assert.equal(g.getAttribute('class'), 'thoughtknot-cloud');
  assert.equal(g.getAttribute('filter'), `url(#${look.CLOUD_BLUR})`);
  assert.equal(g.children.length, 2, 'a puff each');
  assert.ok(Number(g.children[0].getAttribute('r')) > 10, 'each puff reaches past its thing by the pad');
});

// proves: level_regions
test('a region is a wider blurred wash in its subject’s colour', () => {
  const g = look.region(rects, 30, 3);
  assert.equal(g.getAttribute('class'), 'thoughtknot-region');
  assert.equal(g.getAttribute('filter'), `url(#${look.REGION_BLUR})`);
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

test('each blur is put in the drawing’s defs once', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  look.cloudBlur(svg, 4);
  look.cloudBlur(svg, 4);
  look.cloudBlur(svg, 12, look.REGION_BLUR);
  const defs = svg.children.find((c) => c.tagName.toLowerCase() === 'defs');
  const ids = defs.children.map((f) => f.getAttribute('id'));
  assert.deepEqual(ids.sort(), [look.CLOUD_BLUR, look.REGION_BLUR].sort());
});
