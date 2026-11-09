// Rooms opened like folders on the new rendering (editor spec §73, render_room_folders):
// display/graph-view/stage-rooms.ts. The first click picks a room and lists what is in it. The second, or Enter, opens
// it with what is in it named. The badge says the way in. Back goes up one room. A zoom never opens or shuts one.
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** A drawing of two subjects, each with two areas of four boxes, named by property. */
function drawingAndGraph() {
  const boxes = [],
    props = new Map();
  for (const subject of ['Work', 'Money'])
    for (const area of ['A', 'B'])
      for (let i = 0; i < 4; i++) {
        const key = `${subject[0]}${area}${i}`;
        boxes.push({ key, text: key, label: key, kinds: ['Item'] });
        props.set(key, { name: key, subject, area });
      }
  const g = { nodes: props, p: (k) => props.get(k) };
  return { drawing: { boxes, links: [], estimates: [] }, g };
}

/** A stage on a fake page, with hands that record what they were told. */
async function stageOf(look = null) {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  const { RenderStage } = await import('../src/display/graph-view/render-stage.ts');
  const { drawing, g } = drawingAndGraph();
  const viewport = doc.createElement('div');
  doc.body.appendChild(viewport);
  (viewport.win ?? globalThis).matchMedia = (q) => ({ matches: q.includes('reduce') }); // each glide lands at once
  const told = { rooms: [], opened: [], cleared: 0 };
  let chosen = null;
  const hands = {
    open: (key) => (told.opened.push(key), (chosen = key)),
    clear: () => (told.cleared++, (chosen = null)),
    selected: () => chosen,
    room: (r) => told.rooms.push(r),
  };
  const stage = new RenderStage(viewport, drawing, g, hands);
  if (look) stage.lookFrom(look);
  const places = new Map([...stage.spots].map(([k, s]) => [k, { x: s.x, y: s.y }]));
  const done = () => {
    assert.deepEqual(new Map([...stage.spots].map(([k, s]) => [k, { x: s.x, y: s.y }])), places, 'nothing moved');
    stage.unload();
    uninstall();
  };
  return { stage, told, viewport, done };
}

/** The cloud drawn for `key` now. */
const cloudOf = (stage, key) => stage.marks.find((m) => m.kind === 'cloud' && m.key === key);
/** The first room a click can pick now: at the fit, an area, as the subjects round them are not read there. */
const roomOf = (stage) => stage.marks.find((m) => m.kind === 'cloud' && m.pick !== false && !stage.rooms.around(m.key));
/** The name of `key`. */
const nameOf = (stage, key) => stage.scene.nodes.get(key).name;

// proves: render_room_folders
test('the first click picks a room and lists what is in it, by name; nothing moves', async () => {
  const { stage, told, done } = await stageOf();
  const before = { ...stage.view };
  const cloud = roomOf(stage),
    area = stage.scene.nodes.get(cloud.key);
  stage.clicked(cloud.x, cloud.y);
  assert.deepEqual(stage.view, before, 'nothing moves');
  assert.equal(stage.rooms.picked, area.key);
  assert.equal(stage.rooms.open, null, 'picked, not open');
  const room = told.rooms.at(-1);
  assert.equal(room.name, area.name);
  assert.equal(room.kind, 'Areas');
  assert.deepEqual(
    room.parts.map((p) => p.name),
    area.children.map((k) => nameOf(stage, k)),
    'what is in it, by name',
  );
  assert.match(room.said, /^4 inside\./);
  assert.ok(cloudOf(stage, area.key).ring, 'the room picked is ringed');
  // a thing named in the list opens its own details
  room.parts[0].go();
  assert.equal(told.opened.at(-1), area.children[0]);
  assert.equal(stage.rooms.picked, null);
  // a room named in a room's list is picked in turn
  stage.rooms.pick(area.parent);
  told.rooms
    .at(-1)
    .parts.find((p) => p.name === area.name)
    .go();
  assert.equal(stage.rooms.picked, area.key);
  // a click on empty space lets it go
  stage.clicked(-50, -50);
  assert.equal(stage.rooms.picked, null);
  done();
});

// proves: render_room_folders
test('the second click opens the room, filling the screen with what is in it named, and the badge says the way in', async () => {
  const { stage, done } = await stageOf();
  const cloud = roomOf(stage),
    area = stage.scene.nodes.get(cloud.key);
  stage.clicked(cloud.x, cloud.y);
  stage.clicked(cloud.x, cloud.y);
  assert.equal(stage.rooms.open, area.key);
  const subject = nameOf(stage, area.parent);
  assert.equal(stage.level(), `All › ${subject} › ${area.name}`, 'a breadcrumb, not "Level 2 of 3"');
  const spot = stage.spots.get(area.key),
    v = stage.view;
  assert.ok(2 * spot.r * v.scale >= 0.8 * Math.min(v.w, v.h), 'it fills most of the screen');
  for (const k of area.children)
    assert.ok(
      stage.marks.some((m) => m.kind === 'label' && m.key === k),
      `${k} shows named straight away`,
    );
  // a click on the open room's own floor picks nothing
  const floor = cloudOf(stage, area.key);
  stage.clicked(floor.x, floor.y);
  assert.equal(stage.rooms.picked, null);
  // Back goes up one room at a time
  assert.ok(stage.rooms.up());
  assert.equal(stage.rooms.open, area.parent);
  assert.equal(stage.level(), `All › ${subject}`);
  assert.ok(stage.rooms.up());
  assert.equal(stage.rooms.open, null);
  assert.equal(stage.level(), 'All', 'out at the whole drawing');
  assert.equal(stage.rooms.up(), false, 'nowhere further up');
  done();
});

// proves: render_room_folders
test('Enter opens the room picked and Backspace goes up; a key for a field or button is its own', async () => {
  const { stage, viewport, done } = await stageOf();
  const cloud = roomOf(stage);
  stage.clicked(cloud.x, cloud.y);
  const key = (k, target = viewport) => {
    let stopped = false;
    stage.rooms.key({ key: k, target, preventDefault: () => (stopped = true) });
    return stopped;
  };
  assert.ok(key('Enter'));
  assert.equal(stage.rooms.open, cloud.key);
  assert.equal(key('Backspace', { closest: () => ({}) }), false, 'typing in a field never goes up');
  assert.equal(stage.rooms.open, cloud.key);
  assert.ok(key('Backspace'));
  assert.notEqual(stage.rooms.open, cloud.key, 'up one room');
  done();
});

// proves: render_room_folders
test('a zoom never opens or shuts a room; Fit shuts it', async () => {
  const { stage, done } = await stageOf();
  const cloud = roomOf(stage);
  stage.clicked(cloud.x, cloud.y);
  stage.clicked(cloud.x, cloud.y);
  const notch = {
    ctrlKey: true,
    metaKey: false,
    clientX: 300,
    clientY: 150,
    preventDefault() {},
    stopPropagation() {},
  };
  for (const deltaY of [-40, -40, 40, 40, 40, 40, 40, 40]) stage.wheel({ ...notch, deltaY });
  assert.equal(stage.rooms.open, cloud.key, 'zooming in and out keeps the room open');
  stage.zoomBy(0);
  assert.equal(stage.rooms.open, null, 'Fit shows the whole drawing');
  done();
});

// proves: render_room_folders
test('rooms open the same way in 2.5D, 3D and on the globe, and nothing moves', async () => {
  for (const look of ['cards', 'balls', 'globe']) {
    const { stage, done } = await stageOf(look);
    const cloud = roomOf(stage);
    assert.ok(cloud, `${look}: a room to click`);
    const before = { ...stage.view };
    stage.clicked(cloud.x, cloud.y);
    assert.deepEqual(stage.view, before, `${look}: the first click moves nothing`);
    stage.clicked(cloud.x, cloud.y);
    assert.equal(stage.rooms.open, cloud.key, `${look}: the second opens it`);
    assert.ok(stage.view.scale > before.scale, `${look}: nearer`);
    assert.equal(stage.view.tilt ?? 0, before.tilt ?? 0, `${look}: the angle is kept`);
    assert.equal(stage.view.globe ?? 0, before.globe ?? 0, `${look}: still a globe if it was one`);
    done();
  }
});
