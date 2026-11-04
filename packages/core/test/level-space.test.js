// The levels of detail in the view in space (editor spec §68, level_space): level-space.ts. The clouds, roads and
// badge are drawn round the things as the camera sees them, on a layer over the canvas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenBoxes } from '../src/space-outlines.ts';

// proves: level_space
test('each thing in space has its box on the screen, by its key, as the camera sees it', () => {
  const block = (of, x) => ({ id: `b${of}`, style: '', of, x, y: 0, width: 10, depth: 10, floor: 0, tall: 10 });
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const boxes = screenBoxes(
    {
      blocks: [block('a', 0), block('b', 20), { ...block(undefined, 40) }],
      lines: [],
      labels: [],
      arrows: [],
      least: [0, 0, 0],
      most: [1, 1, 1],
    },
    identity,
    200,
    100,
  );
  assert.deepEqual(
    [...boxes.keys()].sort(),
    ['a', 'b'].filter((k) => boxes.has(k)),
    'only things, by their keys',
  );
  for (const r of boxes.values()) assert.ok(r.right > r.left && r.bottom > r.top);
});

// proves: level_space
test('far out in space, the clouds of the level that fits are drawn on a layer over the canvas, with the badge', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { levelSpace, SPACE_LEVELS } = await import('../src/display/graph-view/level-space.ts');
    const boxes = [],
      links = [],
      rects = new Map();
    for (let i = 0; i < 60; i++) {
      const key = `t${i}`;
      boxes.push({ key, text: `Thing ${i}`, kinds: [] });
      rects.set(key, {
        left: (i % 20) * 30,
        top: Math.floor(i / 20) * 30,
        right: (i % 20) * 30 + 20,
        bottom: Math.floor(i / 20) * 30 + 10,
      });
      const ring = Math.floor(i / 6) * 6;
      links.push({ from: key, to: `t${ring + ((i + 1) % 6)}`, type: 'USES' });
      if (i % 6 === 0 && i + 6 < 60) links.push({ from: key, to: `t${i + 6}`, type: 'USES' });
    }
    const el = doc.createElement('div');
    const screen = { boxes: () => rects, width: 600, height: 100, el };
    const badge = levelSpace(screen, { graph: 'g', boxes, links, estimates: [] });
    assert.match(badge, /^Level [12] of 3/);
    const layer = el.children.find((c) => c.classList.contains(SPACE_LEVELS));
    assert.ok(layer, 'a layer over the canvas');
    assert.equal(layer.getAttribute('viewBox'), '0 0 600 100');
    const units = layer.querySelectorAll('g.thoughtknot-cloud-unit');
    assert.ok(units.length >= 2, 'its clouds');
    levelSpace(screen, { graph: 'g', boxes, links, estimates: [] });
    assert.equal(
      el.children.filter((c) => c.classList.contains(SPACE_LEVELS)).length,
      1,
      'drawn again on the same layer',
    );
    // drawn again in its drawing group, never in the blurs' defs, where nothing shows and the old clouds would stay
    const defs = layer.children.find((c) => c.tagName.toLowerCase() === 'defs');
    assert.equal(defs?.querySelectorAll('g.thoughtknot-cloud-unit').length ?? 0, 0, 'none hidden in the defs');
    const graph = layer.children.find((c) => c.classList.contains('graph'));
    assert.equal(graph.querySelectorAll('g.thoughtknot-clouds').length, 1, 'one set of clouds, the new one');
  } finally {
    uninstall();
  }
});
