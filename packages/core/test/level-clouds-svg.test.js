// Clouds drawn on the drawing (editor spec §68, level_clouds, level_roads): level-clouds-svg.ts. Far out, each group
// shows as a named cloud under its things, with roads between clouds. Near in, every item shows as drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** A drawing of `n` things in clumps of six, each clump a ring, `width` units wide shown `shown` pixels wide. */
async function drawn(n, shown) {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  const { make } = await import('../src/display/graph-view/note-callouts.ts');
  const { CLOUDS, FAR, levelClouds } = await import('../src/display/graph-view/level-clouds-svg.ts');
  const width = 1200;
  const svg = make('svg', { viewBox: `0 0 ${width} 800`, width: shown });
  const top = make('g', { class: 'graph' });
  svg.appendChild(top);
  const boxes = [],
    links = [];
  for (let i = 0; i < n; i++) {
    const key = `t${i}`,
      x = (i % 20) * 60,
      y = Math.floor(i / 20) * 40;
    const g = make('g', { class: 'node', 'data-key': key });
    g.appendChild(make('rect', { x, y, width: 40, height: 20 }));
    top.appendChild(g);
    boxes.push({ key, text: `Thing ${i}`, kinds: [] });
    const ring = Math.floor(i / 6) * 6;
    links.push({ from: key, to: `t${ring + ((i + 1) % 6)}`, type: 'USES' });
    if (i % 6 === 0 && i + 6 < n) links.push({ from: key, to: `t${i + 6}`, type: 'USES' });
  }
  const drawing = { graph: 'g', boxes, links, estimates: [] };
  return { svg, top, drawing, CLOUDS, FAR, levelClouds, uninstall };
}

// proves: level_clouds
test('far out a drawing shows its groups as named clouds under its things, which fade; near in, every item as drawn', async () => {
  const { svg, top, drawing, CLOUDS, FAR, levelClouds, uninstall } = await drawn(60, 120);
  try {
    const badge = levelClouds(svg, drawing);
    assert.match(badge, /^Level [12] of 3 · (Subjects|Areas)$/);
    const clouds = top.children[0];
    assert.ok(clouds.classList.contains(CLOUDS), 'the clouds are first, so under the things');
    const units = clouds.children.filter((c) => c.classList.contains('thoughtknot-cloud-unit'));
    const names = units.map((u) => u.children.find((c) => c.classList.contains('thoughtknot-cloud-name')));
    assert.ok(
      units.every((u) => u.getAttribute('data-cloud')),
      'each cloud knows its group',
    );
    const peeks = units.map((u) => u.children.find((c) => c.classList.contains('thoughtknot-cloud-peek')));
    assert.ok(
      peeks.every((p) => p && p.children.length >= 2),
      'each previews the level in it, with a hint',
    );
    assert.ok(names.length >= 2 && names.every((t) => / · \d+$/.test(t.textContent)), 'each named with its count');
    assert.ok(svg.classList.contains(FAR), 'the things fade');
    svg.setAttribute('viewBox', '0 0 120 80');
    assert.equal(levelClouds(svg, drawing), 'Level 3 of 3 · Every item', 'zoomed into a corner');
    assert.ok(!top.children.some((c) => c.classList.contains(CLOUDS)), 'near in, no clouds');
    assert.ok(!svg.classList.contains(FAR), 'and every item as drawn');
    assert.equal(levelClouds(svg, { ...drawing, boxes: drawing.boxes.slice(0, 3) }), null, 'a handful has one level');
  } finally {
    uninstall();
  }
});

// proves: level_roads
test('far out the links between clouds run as roads with gates, and the item links under them only fade', async () => {
  const { svg, top, drawing, CLOUDS, levelClouds, uninstall } = await drawn(60, 120);
  try {
    levelClouds(svg, drawing);
    const clouds = top.children.find((c) => c.classList.contains(CLOUDS));
    const roads = clouds.children.filter((c) => c.classList.contains('thoughtknot-road'));
    const gates = clouds.children.filter((c) => c.classList.contains('thoughtknot-gate'));
    assert.ok(roads.length >= 1, 'a road between two clouds');
    assert.ok(roads.every((r) => /^M/.test(r.getAttribute('d')) && Number(r.getAttribute('stroke-width')) >= 2));
    assert.ok(
      gates.length ===
        2 * new Set(roads.map((r) => [r.getAttribute('data-from'), r.getAttribute('data-to')].sort().join())).size,
    );
    assert.ok(
      gates.every((g) => /^[→←⇄] .+ · \d+$/.test(g.textContent)),
      'each gate says where it goes',
    );
  } finally {
    uninstall();
  }
});
