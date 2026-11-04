// Clouds drawn on the drawing (editor spec §68, level_clouds, level_roads, level_tags): level-clouds-svg.ts. Far out, each
// group shows as a named cloud under its things, with roads between clouds. Near in, every item shows as drawn.
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

// proves: level_clouds, level_look
test('far out a drawing shows its groups as named clouds under its things, which fade; near in, every item as drawn', async () => {
  const { svg, top, drawing, CLOUDS, FAR, levelClouds, uninstall } = await drawn(60, 120);
  try {
    const badge = levelClouds(svg, drawing);
    assert.match(badge, /^Level [12] of 3 · (Subjects|Areas)$/);
    assert.ok(top.children[0].classList.contains('thoughtknot-regions'), "each subject's region first, under all");
    assert.ok(
      top.children[0].children.every((r) => r.getAttribute('filter') === 'url(#thoughtknot-region-blur)'),
      'each region a soft wash (level_regions)',
    );
    const clouds = top.children[1];
    assert.ok(clouds.classList.contains(CLOUDS), 'then the clouds, so under the things');
    const units = clouds.children.filter((c) => c.classList.contains('thoughtknot-cloud-unit'));
    const inCard = (u, cls) => u.querySelectorAll(`.${cls}`)[0];
    assert.ok(
      units.every((u) => u.getAttribute('data-cloud')),
      'each cloud knows its group',
    );
    const peeks = units.map((u) => u.children.find((c) => c.classList.contains('thoughtknot-cloud-peek')));
    assert.ok(
      peeks.every((p) => p && p.children.length >= 2),
      'each previews the level in it, with a hint',
    );
    const soft = units.map((u) => u.children.find((c) => c.classList.contains('thoughtknot-cloud')));
    assert.ok(
      soft.every((c) => c.getAttribute('filter') === 'url(#thoughtknot-cloud-blur)' && c.children.length >= 1),
      'each a soft cloud: a blurred puff round each of its things, as the mockup draws it (level_look)',
    );
    assert.ok(
      units.every((u) => inCard(u, 'thoughtknot-cloud-dots')?.children.length >= 1),
      'far out, each thing a dot',
    );
    const names = units.map((u) => inCard(u, 'thoughtknot-cloud-name'));
    const counts = units.map((u) => inCard(u, 'thoughtknot-cloud-count'));
    assert.ok(names.length >= 2 && names.every((t) => t.textContent.length > 0), 'each named on its card');
    assert.ok(
      counts.every((t) => /^\d+ items$/.test(t.textContent)),
      'with its count',
    );
    assert.ok(svg.classList.contains(FAR), 'the things fade');
    svg.setAttribute('viewBox', '0 0 120 80');
    assert.equal(levelClouds(svg, drawing), 'Level 3 of 3 · Every item', 'zoomed into a corner');
    assert.ok(!top.children.some((c) => c.classList.contains(CLOUDS)), 'near in, no clouds');
    assert.ok(top.children[0].classList.contains('thoughtknot-regions'), 'but the regions stay');
    assert.ok(!svg.classList.contains(FAR), 'and every item as drawn');
    assert.equal(levelClouds(svg, { ...drawing, boxes: drawing.boxes.slice(0, 3) }), null, 'a handful has one level');
  } finally {
    uninstall();
  }
});

// proves: level_roads
test('far out the links between clouds run as roads, one lane each way with its count, and signposts lead out', async () => {
  const { svg, top, drawing, CLOUDS, levelClouds, uninstall } = await drawn(60, 120);
  try {
    const badge = levelClouds(svg, drawing);
    const clouds = top.children.find((c) => c.classList.contains(CLOUDS));
    const lanes = clouds.children[0];
    assert.ok(lanes.classList.contains('thoughtknot-roads'), 'the roads lie under the clouds and their cards');
    const roads = lanes.children.filter((c) => c.classList.contains('thoughtknot-road'));
    assert.ok(roads.length >= 1, 'a road between two clouds');
    assert.ok(
      roads.every(
        (r) => /^M[\d.,-]+ Q[\d., -]+$/.test(r.getAttribute('d')) && Number(r.getAttribute('stroke-width')) > 0,
      ),
      'each lane one gentle bend, its width by its links',
    );
    const pairs = new Set(roads.map((r) => `${r.getAttribute('data-from')}>${r.getAttribute('data-to')}`));
    assert.equal(pairs.size, roads.length, 'one lane each way');
    const gates = lanes.children.filter((c) => c.classList.contains('thoughtknot-gate'));
    assert.ok(
      gates.every((g) => /^[→←⇄] .+ · \d+$/.test(g.textContent)),
      'each signpost says where its links go',
    );
    assert.ok(badge && gates.length === 0, 'with every cloud on screen, the roads show the way: no signposts');
  } finally {
    uninstall();
  }
});

// proves: level_roads, level_regions
test('a signpost points the way only where a road leads to a cloud off screen', async () => {
  const { svg, top, drawing, CLOUDS, levelClouds, uninstall } = await drawn(120, 1200);
  try {
    const port = svg.ownerDocument.createElement('div');
    port.appendChild(svg);
    const rect = (left, t, width, height) => () => ({
      left,
      top: t,
      width,
      height,
      right: left + width,
      bottom: t + height,
    });
    svg.getBoundingClientRect = rect(0, 0, 1200, 800);
    port.getBoundingClientRect = rect(0, 0, 400, 800);
    const badge = levelClouds(svg, drawing);
    assert.match(badge, /Subjects|Areas/, 'a level of groups');
    const clouds = top.children.find((c) => c.classList.contains(CLOUDS));
    const gates = clouds.children[0].children.filter((c) => c.classList.contains('thoughtknot-gate'));
    assert.ok(gates.length >= 1, 'roads to the clouds scrolled out of view get a signpost');
    assert.ok(
      gates.every((g) => Number(g.getAttribute('x')) <= 400 + 1),
      'each by a cloud on screen',
    );
  } finally {
    uninstall();
  }
});

// proves: level_tags
test("clouds' cards and gates' signposts that would overlap are moved down, and the rest stay", async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { make } = await import('../src/display/graph-view/note-callouts.ts');
    const { card } = await import('../src/display/graph-view/level-look.ts');
    const { unclash } = await import('../src/display/graph-view/level-clouds-svg.ts');
    const group = make('g', {});
    const money = group.appendChild(card(100, 50, 'Money', '6 items', 1)),
      far = group.appendChild(card(900, 50, 'Health', '6 items', 1));
    const gate = make('text', { class: 'thoughtknot-gate', x: 110, y: 52, 'font-size': 10 });
    gate.textContent = '→ Health · 2';
    group.appendChild(gate);
    unclash(group);
    assert.equal(money.getAttribute('transform'), null, 'the higher one stays');
    assert.ok(Number(gate.getAttribute('y')) > 60, 'the gate moves just below the card');
    assert.equal(far.getAttribute('transform'), null, 'one that overlaps none stays');
    assert.equal(gate.getAttribute('x'), '110', 'never moved across');
  } finally {
    uninstall();
  }
});

// proves: level_look
test('zoomed in, the drawing grows past its viewport, and only the part the viewport shows picks the level', async () => {
  const { svg, drawing, levelClouds, uninstall } = await drawn(60, 1200);
  try {
    const port = svg.ownerDocument.createElement('div');
    port.appendChild(svg);
    const rect = (left, top, width, height) => () => ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    });
    svg.getBoundingClientRect = rect(0, 0, 1200, 800);
    port.getBoundingClientRect = rect(0, 0, 1200, 800);
    assert.match(levelClouds(svg, drawing), /Areas|Subjects/, 'the whole drawing in view');
    port.getBoundingClientRect = rect(0, 0, 120, 80);
    assert.equal(levelClouds(svg, drawing), 'Level 3 of 3 · Every item', 'only its corner scrolled into view');
  } finally {
    uninstall();
  }
});
