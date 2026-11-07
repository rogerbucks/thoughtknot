// Faint roads (editor spec §73, render_faint_roads): render/render-roads.ts and display/graph-view/stage-faint.ts. A
// switch in the View panel keeps the roads of bigger groups faintly in sight as the reader zooms in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneOf } from '../src/render/render-scene.ts';
import { roomsOf } from '../src/render/render-rooms.ts';
import { detailAt, roomSizes } from '../src/render/render-detail.ts';
import { LIGHT } from '../src/render/render-look.ts';
import { roadsOf } from '../src/render/render-roads.ts';
import { coloursOf } from '../src/render/render-marks.ts';

const thing = (key, names = {}) => ({ key, text: key, kinds: ['Item'], texts: new Map(Object.entries(names)) });
const link = (from, to) => ({ from, to, type: 'RELATES' });

// Roger, 7 Nov 2026: allow the reader to see a faint view of roads at a detail level if needed.
// proves: render_faint_roads
test('zoomed in, the roads of bigger groups fade away, unless Faint roads keeps them faintly in sight', () => {
  const things = [];
  for (const subject of ['Work', 'Money'])
    for (const area of ['A', 'B'])
      for (let i = 0; i < 6; i++) things.push(thing(`${subject[0]}${area}${i}`, { subject, area }));
  const scene = sceneOf({ things, links: [link('WA0', 'MA0'), link('WB1', 'MB1')] });
  const spots = roomsOf(scene);
  const sizes = roomSizes(scene, spots);
  const colours = coloursOf(scene, LIGHT);
  const top = (roads) => roads.filter((m) => m.depth === 0);
  // inside Work, its room filling the screen: the road between the subjects is gone
  const [w] = scene.roots.map((k) => spots.get(k));
  const scale = 1800 / (2 * w.r);
  const view = { x: w.x - 640 / scale, y: w.y - 400 / scale, scale, w: 1280, h: 800 };
  const detail = detailAt(sizes, scale);
  assert.equal(
    top(roadsOf(scene, spots, detail, view, colours, LIGHT)).length,
    0,
    'off, the road between subjects is gone',
  );
  const faint = top(roadsOf(scene, spots, { ...detail, faintRoads: 0.2 }, view, colours, LIGHT));
  assert.equal(faint.length, 1, 'on, it stays');
  assert.ok(faint[0].alpha >= 0.2 && faint[0].alpha < 0.5, 'faintly');
  // a level not open at all has no roads either way: far out, items have none
  const far = { x: -5000, y: -5000, scale: 0.05, w: 1280, h: 800 };
  const out = roadsOf(scene, spots, { ...detailAt(sizes, 0.05), faintRoads: 0.2 }, far, colours, LIGHT);
  assert.ok(
    out.every((r) => r.depth === 0),
    'only the levels in sight',
  );
});

// proves: render_faint_roads
test('the View panel has a Faint roads switch, off unless the reader turns it on', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { RenderStage } = await import('../src/display/graph-view/render-stage.ts');
    const view = doc.createElement('div');
    view.classList.add('thoughtknot-view');
    doc.body.appendChild(view);
    const menu = doc.createElement('div');
    menu.classList.add('thoughtknot-view-menu');
    view.appendChild(menu);
    const viewport = doc.createElement('div');
    view.appendChild(viewport);
    const boxes = [],
      props = new Map();
    for (const subject of ['Work', 'Money'])
      for (let i = 0; i < 6; i++) {
        boxes.push({ key: `${subject}${i}`, text: `${subject}${i}`, label: `${subject}${i}`, kinds: ['Item'] });
        props.set(`${subject}${i}`, { name: `${subject}${i}`, subject, area: `${subject}${i % 2}` });
      }
    const stage = new RenderStage(
      viewport,
      { boxes, links: [], estimates: [] },
      { nodes: props, p: (k) => props.get(k) },
    );
    const b = menu.querySelector('.thoughtknot-faint-roads');
    assert.ok(b, 'the switch is in the View panel');
    assert.equal(b.getAttribute('role'), 'switch');
    assert.equal(b.getAttribute('aria-checked'), 'false', 'off to start');
    b.click();
    assert.equal(b.getAttribute('aria-checked'), 'true', 'a click turns it on');
    stage.draw();
    assert.equal(menu.querySelectorAll('.thoughtknot-faint-roads').length, 1, 'once, however often it draws');
    stage.unload();
    assert.equal(menu.querySelector('.thoughtknot-faint-roads'), null, 'it goes with the stage');
  } finally {
    uninstall();
  }
});
