// The marks, layer L4 of the rendering spec (editor spec §73, render_marks): render/render-marks.ts. Plain marks on the
// screen, with one label placer: names held between 11 and 16 px, inside the view, never overlapping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneOf } from '../src/render/render-scene.ts';
import { roomsOf } from '../src/render/render-rooms.ts';
import { detailAt, roomSizes } from '../src/render/render-detail.ts';
import { arrowOf, signsOf } from '../src/render/render-signs.ts';
import { fitView, zoomTo } from '../src/render/render-camera.ts';
import { DARK, LIGHT, contrast, inkOn, subjectColour } from '../src/render/render-look.ts';
import {
  HEADER_PX,
  ITEM_PX,
  MAX_PX,
  MIN_PX,
  coloursOf,
  cloudAlpha,
  countOf,
  crisp,
  marksOf,
  placeLabels,
  wrapName,
} from '../src/render/render-marks.ts';

const thing = (key, names = {}) => ({
  key,
  text: `Thing ${key}`,
  kinds: ['Item'],
  texts: new Map(Object.entries(names)),
});
const link = (from, to) => ({ from, to, type: 'RELATES' });

function picture(scale) {
  const things = [];
  for (const subject of ['Work', 'Money', 'Home'])
    for (const area of ['A', 'B'])
      for (let i = 0; i < 8; i++) things.push(thing(`${subject[0]}${area}${i}`, { subject, area }));
  const scene = sceneOf({ things, links: [link('WA0', 'MA0'), link('MA1', 'WB1'), link('HA0', 'WA2')] });
  const spots = roomsOf(scene);
  const detail = detailAt(roomSizes(scene, spots), scale);
  const marks = marksOf(scene, spots, detail, LIGHT, { x: 0, y: 0, scale, w: 1280, h: 800 });
  return { scene, marks };
}

const overlap = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;

// proves: render_marks
test('labels are between 11 and 16 px, inside the view and never overlap, at every zoom', () => {
  for (const scale of [0.3, 0.6, 1, 2, 4]) {
    const labels = picture(scale).marks.filter((m) => m.kind === 'label');
    for (const l of labels) {
      assert.ok(l.px >= MIN_PX && l.px <= MAX_PX, `${l.text} at ${l.px}px`);
      assert.ok(l.x >= 0 && l.y >= 0 && l.x + l.w <= 1280 && l.y + l.h <= 800, `${l.text} is cut`);
    }
    for (let i = 0; i < labels.length; i++)
      for (let j = i + 1; j < labels.length; j++) assert.ok(!overlap(labels[i], labels[j]), `${labels[i].text}`);
  }
});

// proves: render_marks
test('far out the subjects are named and joined by roads; close in the items are named', () => {
  const far = picture(0.3).marks;
  const names = far.filter((m) => m.kind === 'label').map((m) => m.text);
  assert.deepEqual([...names].sort(), ['Home', 'Money', 'Work']);
  const roads = far.filter((m) => m.kind === 'road');
  assert.ok(roads.length >= 2);
  assert.ok(roads.every((r) => r.width >= 2));
  const near = picture(6).marks.filter((m) => m.kind === 'label');
  assert.ok(near.some((m) => m.text.startsWith('Thing ')));
});

// proves: render_marks
test('when two names clash, the heavier keeps its place', () => {
  const asks = [
    { key: 'small', text: 'Small', x: 100, y: 100, px: 12, fill: '#ffffff', alpha: 1, weight: 1 },
    { key: 'big', text: 'Big', x: 104, y: 102, px: 12, fill: '#ffffff', alpha: 1, weight: 9 },
  ];
  assert.deepEqual(
    placeLabels(asks, { x: 0, y: 0, scale: 1, w: 400, h: 300 }).map((l) => l.key),
    ['big'],
  );
});

// The mockup shows every subject's name far out. A lighter group's name that would sit on a heavier one's moves
// within its cloud; an item's name never leaves its dot.
// proves: render_marks
test('a group name that clashes moves up or down within its room, and an item name with none is dropped', () => {
  const view = { x: 0, y: 0, scale: 1, w: 400, h: 300 };
  const big = { key: 'big', text: 'Learning', x: 200, y: 150, px: 16, fill: '#22aacc', alpha: 1, weight: 9 };
  const side = { key: 'side', text: 'Side projects', x: 150, y: 150, px: 16, fill: '#ccaa22', alpha: 1, weight: 1 };
  const [first, moved] = placeLabels([big, { ...side, room: 40 }], view);
  assert.equal(first.y + first.h / 2, 150, 'the heavier name keeps its place');
  assert.equal(moved.key, 'side');
  assert.equal(moved.x + moved.w / 2, 150, 'it keeps its place across');
  assert.ok(Math.abs(moved.y + moved.h / 2 - 150) <= 40, 'it stays within its room');
  assert.ok(moved.y + moved.h + 2 <= first.y || first.y + first.h + 2 <= moved.y, 'the two no longer meet');
  assert.deepEqual(
    placeLabels([big, side], view).map((l) => l.key),
    ['big'],
  );
});

// proves: render_marks
test('a name at the edge of the controls slides clear of them while it still covers its spot', () => {
  const view = { x: 0, y: 0, scale: 1, w: 400, h: 300, clear: { top: 0, right: 0, bottom: 0, left: 100 } };
  const ask = { key: 'side', text: 'Side projects', x: 130, y: 150, px: 16, fill: '#ccaa22', alpha: 1, weight: 1 };
  const [slid] = placeLabels([ask], view);
  assert.equal(slid.x, 102, 'it starts a gap past where the controls end');
  assert.ok(slid.x <= 130 && 130 <= slid.x + slid.w, 'it still covers its spot');
  assert.deepEqual(placeLabels([{ ...ask, x: 20 }], view), [], 'a spot under the controls keeps no name');
});

// proves: render_marks
test('each subject has its own colour and its areas take shades of it', () => {
  const { scene } = picture(1);
  const colours = coloursOf(scene, LIGHT);
  const subjects = scene.roots.map((k) => colours.get(k));
  assert.equal(new Set(subjects).size, subjects.length);
  const work = scene.nodes.get(scene.roots.find((k) => scene.nodes.get(k).name === 'Work'));
  const areas = work.children.map((k) => colours.get(k));
  assert.equal(new Set(areas).size, areas.length);
  const named = ['Work', 'Money', 'Home'].map((n) =>
    colours.get(scene.roots.find((k) => scene.nodes.get(k).name === n)),
  );
  assert.deepEqual(
    named,
    [0, 1, 2].map((i) => subjectColour(LIGHT, i)),
    'colours go in the order the note names them',
  );
});

// proves: render_marks
test('a road says its count each way, and a single link says nothing', () => {
  assert.equal(countOf(3, 1), '3 ⇄ 1');
  assert.equal(countOf(2, 0), '2 →');
  assert.equal(countOf(0, 4), '← 4');
  assert.equal(countOf(1, 0), '');
});

// proves: render_marks
test('roads join only neighbours in the same room', () => {
  const { scene, marks } = picture(2);
  for (const r of marks.filter((m) => m.kind === 'road'))
    assert.equal(scene.nodes.get(r.a).parent, scene.nodes.get(r.b).parent, `${r.a} to ${r.b}`);
});

// Roger, 7 Nov 2026 (nightly): highways went to the middle of a cluster, which confused. They stayed when zoomed in.
// The circles faded out zoomed in, so a cluster's bounds and name were hard to see.
// proves: render_marks
test('a road runs edge to edge of its rooms and is gone once you are inside a room; a cloud keeps its edge', () => {
  const things = [];
  for (const subject of ['Work', 'Money', 'Home'])
    for (const area of ['A', 'B'])
      for (let i = 0; i < 8; i++) things.push(thing(`${subject[0]}${area}${i}`, { subject, area }));
  const scene = sceneOf({ things, links: [link('WA0', 'MA0'), link('MA1', 'WB1'), link('HA0', 'WA2')] });
  const spots = roomsOf(scene);
  const sizes = roomSizes(scene, spots);
  const view = (scale) => ({ x: 0, y: 0, scale, w: 1280, h: 800 });
  const at = (scale) => marksOf(scene, spots, detailAt(sizes, scale), LIGHT, view(scale));
  const far = 0.3;
  const roads = at(far).filter((m) => m.kind === 'road' && scene.nodes.get(m.a).depth === 0);
  assert.ok(roads.length >= 2);
  for (const r of roads) {
    const [p, q] = [spots.get(r.a), spots.get(r.b)];
    const d = Math.hypot(p.x - q.x, p.y - q.y) * far;
    const off = (end, s) => Math.hypot(end[0] - s.x * far, end[1] - s.y * far);
    for (const [end, s] of [
      [r.from, p],
      [r.to, q],
    ])
      assert.ok(Math.abs(off(end, s) - Math.min(s.r * far, d * 0.4)) < 0.01, `${r.a}-${r.b} ends at its room's edge`);
  }
  // zoomed into Work until it fills the screen: its roads are gone, and signposts mark the ways out instead
  const work = spots.get(scene.named[0]);
  const scale = 900 / (2 * work.r);
  const inside = { x: work.x - 640 / scale, y: work.y - 400 / scale, scale, w: 1280, h: 800 };
  const marks = marksOf(scene, spots, detailAt(sizes, scale), LIGHT, inside);
  const ways = marks.filter((m) => m.kind === 'road' && (m.a === scene.named[0] || m.b === scene.named[0]));
  assert.deepEqual(ways, [], 'inside a room, its roads are gone');
  // its cloud fades there, but keeps a clear line round its edge
  const cloud = marks.find((m) => m.kind === 'cloud' && m.key === scene.named[0]);
  assert.ok(cloud.alpha < 0.3 && cloud.ring >= 0.5, 'the room keeps its edge');
});

// proves: render_look_in_marks
test('a cloud fades once the level inside opens, and one bigger than the screen never washes it out', () => {
  const view = { x: 0, y: 0, scale: 1, w: 800, h: 600 };
  const small = { x: 400, y: 300, r: 100 };
  assert.ok(cloudAlpha(1, small, view) > cloudAlpha(0.2, small, view));
  const huge = { x: 400, y: 300, r: 8000 };
  assert.ok(cloudAlpha(1, huge, view) < cloudAlpha(1, small, view) / 2);
  assert.ok(cloudAlpha(1, huge, view) > 0, 'the ground still shows');
});

// proves: render_marks
test('no name is placed under the controls', () => {
  const asks = [
    { key: 'a', text: 'Under the docks', x: 100, y: 100, px: 14, fill: '#4b7bf5', alpha: 1, weight: 2 },
    { key: 'b', text: 'In the clear', x: 600, y: 100, px: 14, fill: '#4b7bf5', alpha: 1, weight: 1 },
  ];
  const view = { x: 0, y: 0, scale: 1, w: 1000, h: 400, clear: { top: 0, right: 0, bottom: 0, left: 300 } };
  assert.deepEqual(
    placeLabels(asks, view).map((l) => l.key),
    ['b'],
  );
});

// proves: render_look_in_marks
test('close in, an item is named on a white card with a dot of its colour', () => {
  const items = picture(4).marks.filter((m) => m.kind === 'label' && m.dot);
  assert.ok(items.length > 0);
  for (const l of items) {
    assert.equal(l.fill, LIGHT.card);
    assert.equal(l.ink, inkOn(LIGHT.card));
  }
});

// proves: render_look_in_marks
test('far out, a subject is a white card edged in its colour, its name in its colour, and how many items it holds', () => {
  for (const look of [LIGHT, DARK]) {
    const things = [];
    for (const subject of ['Work', 'Money', 'Home'])
      for (let i = 0; i < 8; i++) things.push(thing(`${subject[0]}${i}`, { subject, area: 'A' }));
    const scene = sceneOf({ things, links: [link('W0', 'M0'), link('W1', 'M1'), link('M2', 'W2')] });
    const spots = roomsOf(scene);
    const marks = marksOf(scene, spots, detailAt(roomSizes(scene, spots), 0.3), look, {
      x: 0,
      y: 0,
      scale: 0.3,
      w: 1280,
      h: 800,
    });
    const groups = marks.filter((m) => m.kind === 'label' && !m.dot);
    assert.equal(groups.length, 3);
    for (const l of groups) {
      assert.equal(l.fill, look.card);
      assert.equal(l.sub, '8 items');
      assert.ok(l.subPx >= MIN_PX, 'the second line is still readable');
      assert.ok(contrast(l.ink, look.card) >= 4.5, `${l.text} reads on its card`);
      assert.ok(l.edge && l.edge !== look.card);
    }
    const road = marks.find((m) => m.kind === 'road' && m.count);
    assert.equal(road.chip, look.card, 'the count sits on a white chip');
    assert.ok(contrast(road.ink, look.card) >= 4.5);
  }
});

// proves: render_marks
test('zoomed in, names stay as easy to read as at the top: clear or not drawn, never a faint ghost', () => {
  // Roger, 7 Nov 2026: zooming below the top level lost the nice formatting
  assert.equal(crisp(0.2), 0, 'a name half faded in is not drawn yet');
  assert.equal(crisp(0.9), 1);
  for (const scale of [0.6, 1, 2, 4, 8]) {
    const { scene, marks } = picture(scale);
    const last = scene.depths.length - 1;
    for (const l of marks.filter((m) => m.kind === 'label')) {
      const node = scene.nodes.get(l.key);
      assert.ok(l.alpha > 0.05, `${l.text} is drawn only where it can be read`);
      if (node.depth === last) assert.equal(l.px, ITEM_PX, 'an item reads at 13 px');
      else assert.ok(l.px >= HEADER_PX, `${l.text}: a group's name keeps a readable size as it opens`);
    }
  }
});

// proves: level_regions
test('a signpost at the edge points the way to a room off screen, and names it; a road on screen has none', () => {
  // Roger, 7 Nov 2026: no signposts were shown for a link to something off screen (from the mockup)
  assert.equal(arrowOf(1, 0), '→');
  assert.equal(arrowOf(0, 1), '↓');
  assert.equal(arrowOf(-1, -1), '↖');
  const things = [];
  for (const subject of ['Work', 'Money', 'Home'])
    for (const area of ['A', 'B'])
      for (let i = 0; i < 8; i++) things.push(thing(`${subject[0]}${area}${i}`, { subject, area }));
  const scene = sceneOf({ things, links: [link('WA0', 'MA0'), link('MA1', 'WB1'), link('HA0', 'WA2')] });
  const spots = roomsOf(scene);
  const sizes = roomSizes(scene, spots);
  // the whole drawing on screen: every road shows itself, so no signposts
  const all = { x: -2000, y: -2000, scale: 0.15, w: 1280, h: 800 };
  const at = (view) => signsOf(scene, spots, detailAt(sizes, view.scale), view, coloursOf(scene, LIGHT), LIGHT);
  assert.deepEqual(at(all), [], 'every road shows itself, so no signposts');
  // close on Work, with Money and Home off screen: a signpost to each, at the edge, pointing their way
  const work = spots.get(scene.named[0]);
  const near = { x: work.x - 640 / 3, y: work.y - 400 / 3, scale: 3, w: 1280, h: 800 };
  const signs = at(near);
  const onScreen = (s) => ({ x: (s.x - near.x) * near.scale, y: (s.y - near.y) * near.scale });
  for (const sign of signs) {
    const far = onScreen(spots.get(sign.key));
    assert.ok(far.x < 0 || far.y < 0 || far.x > 1280 || far.y > 800, `${sign.text}: its room is off screen`);
    assert.ok(sign.x > 0 && sign.x < 1280 && sign.y > 0 && sign.y < 800, `${sign.text} stands on screen`);
    const edge = Math.min(sign.x, sign.y, 1280 - sign.x, 800 - sign.y);
    assert.ok(edge < 120, `${sign.text} stands by the edge`);
    assert.equal(
      sign.text[0],
      arrowOf(
        far.x - Math.min(Math.max((work.x - near.x) * 3, 0), 1280),
        far.y - Math.min(Math.max((work.y - near.y) * 3, 0), 800),
      )[0],
    );
  }
  assert.equal(signs.length, 2, 'the ways out of Work, to Money and to Home, are marked');
  assert.equal(new Set(signs.map((s) => s.key)).size, signs.length, 'one signpost for each room');
  // common sense (Roger, 7 Nov 2026): legible, big enough to tap, and never over another name
  const marks = marksOf(scene, spots, detailAt(sizes, near.scale), LIGHT, near);
  const labels = marks.filter((m) => m.kind === 'label');
  const posts = labels.filter((m) => /^[→↘↓↙←↖↑↗] /.test(m.text));
  assert.equal(posts.length, 2, 'both signposts painted');
  for (const post of posts) {
    assert.ok(post.px >= ITEM_PX && post.h >= 24, `${post.text}: legible, and at least 24 px high to tap`);
    for (const other of labels)
      if (other !== post) assert.ok(!overlap(post, other), `${post.text} clear of ${other.text}`);
  }
});

// Roger, 7 Nov 2026 (nightly, with a picture): zoomed far out, the subjects' names piled up in a jumble over a tiny
// drawing. They should stand in order round it.
// proves: render_marks
test('far out, crowded subject names stand in two ordered columns beside the drawing, each joined to its cloud', () => {
  const subjects = ['Every graph carries its own', 'Two process views', 'Joining graphs', 'The lending demo'];
  subjects.push('Notation and GQL', 'Paths and altitude', 'Working with AI', "The library's tools");
  const things = [];
  for (const subject of subjects) for (let i = 0; i < 6; i++) things.push(thing(`${subject}-${i}`, { subject }));
  const scene = sceneOf({ things, links: [] });
  const spots = roomsOf(scene);
  const sizes = roomSizes(scene, spots);
  const fit = fitView(spots.values(), 1280, 800);
  const marks = (view) => marksOf(scene, spots, detailAt(sizes, view.scale), LIGHT, view);
  // at the fit the names sit on their clouds, with no lines
  assert.ok(
    marks(fit)
      .filter((m) => m.kind === 'label')
      .every((m) => !m.lead),
  );
  // zoomed far out about the middle: the drawing is small, its names would crowd it
  const scale = fit.scale / 6;
  const far = zoomTo(fit, scale, [640, 400]);
  const labels = marks(far).filter((m) => m.kind === 'label');
  const clouds = marks(far).filter((m) => m.kind === 'cloud');
  assert.equal(labels.length, subjects.length, 'every subject is named');
  const [x0, x1] = [Math.min(...clouds.map((c) => c.x - c.r)), Math.max(...clouds.map((c) => c.x + c.r))];
  for (const l of labels) {
    assert.ok(l.x + l.w <= x0 || l.x >= x1, `${l.text} stands beside the drawing, not over it`);
    assert.ok(l.lead, `${l.text} is joined to its cloud`);
    const cloud = clouds.find((c) => c.key === l.key);
    assert.ok(
      Math.abs(Math.hypot(l.lead[2] - cloud.x, l.lead[3] - cloud.y) - cloud.r) < 0.01,
      'the line meets its edge',
    );
    assert.ok(l.x >= 0 && l.x + l.w <= 1280 && l.y >= 0 && l.y + l.h <= 800, `${l.text} is on screen`);
  }
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++) assert.ok(!overlap(labels[i], labels[j]), labels[i].text);
  // each column goes top to bottom in the order its clouds do, so the lines never cross
  for (const side of [labels.filter((l) => l.x < x0), labels.filter((l) => l.x >= x1)]) {
    const byName = [...side].sort((p, q) => p.y - q.y).map((l) => l.key);
    const byCloud = [...side].sort(
      (p, q) => clouds.find((c) => c.key === p.key).y - clouds.find((c) => c.key === q.key).y,
    );
    assert.deepEqual(
      byName,
      byCloud.map((l) => l.key),
    );
  }
});

// proves: render_marks
test('in a small card, crowded subject names stand round the drawing where there is room, apart and joined', () => {
  const subjects = ['Every graph carries its own', 'Two process views', 'Joining graphs', 'The lending demo'];
  subjects.push('Notation and GQL', 'Paths and altitude', 'Working with AI', "The library's tools", 'Release notes');
  const things = [];
  for (const subject of subjects) for (let i = 0; i < 6; i++) things.push(thing(`${subject}-${i}`, { subject }));
  const scene = sceneOf({ things, links: [] });
  const spots = roomsOf(scene);
  const sizes = roomSizes(scene, spots);
  const fit = fitView(spots.values(), 600, 440);
  const far = zoomTo(fit, fit.scale / 2.5, [300, 220]);
  const marks = marksOf(scene, spots, detailAt(sizes, far.scale), LIGHT, far);
  const labels = marks.filter((m) => m.kind === 'label');
  const clouds = marks.filter((m) => m.kind === 'cloud');
  const box = [
    Math.min(...clouds.map((c) => c.x - c.r)),
    Math.min(...clouds.map((c) => c.y - c.r)),
    Math.max(...clouds.map((c) => c.x + c.r)),
    Math.max(...clouds.map((c) => c.y + c.r)),
  ];
  assert.ok(labels.length >= subjects.length - 2, `${labels.length} of ${subjects.length} named`);
  for (const l of labels) {
    assert.ok(l.lead, `${l.text} is joined to its cloud`);
    const outside = l.x + l.w <= box[0] || l.x >= box[2] || l.y + l.h <= box[1] || l.y >= box[3];
    assert.ok(outside, `${l.text} stands clear of the drawing`);
    assert.ok(l.x >= 0 && l.x + l.w <= 600 && l.y >= 0 && l.y + l.h <= 440, `${l.text} is on screen`);
  }
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++) assert.ok(!overlap(labels[i], labels[j]), labels[i].text);
});

// Roger, 7 Nov 2026 (nightly): zoomed in, give a node's name room for two lines, or its whole title across 5-6 lines.
// proves: render_marks
test('a long name wraps between words onto at most six lines, the last cut with an ellipsis', () => {
  assert.deepEqual(wrapName('Short', 22, 6), ['Short']);
  assert.deepEqual(wrapName('How the lending demo reads its own notes', 22, 6), [
    'How the lending demo',
    'reads its own notes',
  ]);
  assert.deepEqual(wrapName('Supercalifragilisticexpialidocious', 22, 6), ['Supercalifragilisticex', 'pialidocious']);
  const long = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen';
  const six = wrapName(`${long} ${long}`, 22, 6);
  assert.equal(six.length, 6);
  assert.ok(six.every((l) => l.length <= 22));
  assert.ok(six[5].endsWith('…'));
});

// proves: render_marks
test('close in, an item with a long name shows it on two lines or more, apart from every other name', () => {
  const name = 'How the lending demo reads its own notes and keeps them in step';
  const things = [];
  for (const subject of ['Work', 'Money'])
    for (let i = 0; i < 6; i++) things.push({ ...thing(`${subject[0]}${i}`, { subject }), text: `${name} ${i}` });
  const scene = sceneOf({ things, links: [] });
  const spots = roomsOf(scene);
  const sizes = roomSizes(scene, spots);
  const item = spots.get('W0');
  const at = (scale) => {
    const view = { x: item.x - 640 / scale, y: item.y - 400 / scale, scale, w: 1280, h: 800 };
    return marksOf(scene, spots, detailAt(sizes, scale), LIGHT, view).filter((m) => m.kind === 'label');
  };
  const open = (44 / sizes[1]) * 1.05;
  const near = at(open).filter((m) => m.key.length === 2);
  assert.ok(near.length > 0, 'items are named');
  assert.ok(
    near.some((m) => m.lines?.length >= 2),
    'a long name takes two lines once items are fully shown',
  );
  const closer = at(open * 3).filter((m) => m.key.length === 2);
  const most = Math.max(...closer.map((m) => m.lines?.length ?? 1));
  assert.ok(most >= 3 && most <= 6, `closer in, more of it shows: ${most} lines`);
  for (const m of closer.filter((l) => l.lines)) {
    assert.ok(name.startsWith(m.lines.join(' ').replace('…', '').slice(0, 20)), `${m.key}: its own words, in order`);
    assert.ok(m.h >= m.px * 1.6 + (m.lines.length - 1) * m.px, `${m.key}: the card is tall enough for its lines`);
  }
  for (const labels of [at(open), at(open * 3)])
    for (let i = 0; i < labels.length; i++)
      for (let j = i + 1; j < labels.length; j++) assert.ok(!overlap(labels[i], labels[j]), labels[i].key);
});

// Roger, 7 Nov 2026: labels should not overlap roads of the same level or above, so it is plain what is what.
// proves: render_marks
test('a name keeps off a road of its own level or above where it can, still on its thing; a deeper road is left', () => {
  const ask = {
    key: 'g',
    text: 'Group',
    x: 200,
    y: 100,
    px: 14,
    fill: '#ffffff',
    alpha: 1,
    weight: 1,
    depth: 1,
    room: 40,
  };
  const road = (depth) => ({ kind: 'road', a: 'p', b: 'q', from: [0, 100], to: [400, 100], width: 3, depth });
  const view = { x: 0, y: 0, scale: 1, w: 400, h: 300 };
  const [plain] = placeLabels([ask], view);
  assert.ok(plain.y < 100 && plain.y + plain.h > 100, 'with no road it sits on its spot');
  const [off] = placeLabels([ask], view, [road(0)]);
  assert.ok(off.y > 100 + 2 || off.y + off.h < 100 - 2, 'moved clear of a road above its level');
  assert.ok(off.x <= 200 && 200 <= off.x + off.w, 'still over its thing');
  const [same] = placeLabels([ask], view, [road(1)]);
  assert.ok(same.y > 100 + 2 || same.y + same.h < 100 - 2, 'and of a road at its own level');
  const [deeper] = placeLabels([ask], view, [road(2)]);
  assert.deepEqual(deeper, plain, 'a road deeper in is left to run under it');
  // an item has no room to move: it keeps its name where it is, rather than losing it
  const [item] = placeLabels([{ ...ask, room: undefined }], view, [road(1)]);
  assert.deepEqual([item.x, item.y], [plain.x, plain.y]);
});

// proves: render_pick_shown
test('only what the level being read shows can be picked: far out the subjects, close in the items', () => {
  const pickable = (scale) => {
    const { scene, marks } = picture(scale);
    const depth = (m) => scene.nodes.get(m.key)?.depth;
    return marks.filter((m) => (m.kind === 'cloud' || m.kind === 'dot') && m.pick !== false).map(depth);
  };
  const far = pickable(0.3);
  assert.ok(far.length && far.every((d) => d === 0), `far out only subjects: ${far}`);
  const near = pickable(6);
  assert.ok(near.length && near.every((d) => d === 2), `close in only items: ${near}`);
});
