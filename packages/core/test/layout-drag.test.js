// A place a person gives a thing by dragging it is saved in the graph's layout block, and nothing else moves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forgetInNote, placeInNote, savedPlaces } from '../src/layout-places.ts';
import { sceneOf } from '../src/render/render-scene.ts';
import { roomsOf } from '../src/render/render-rooms.ts';

const GRAPH = "// graph: trip\n(ann:Person {name: 'Ann'}),\n(bob:Person {name: 'Bob'})";
const note = (...more) => ['# Trip', '', '```gql', GRAPH, '```', ...more].join('\n');

// proves: layout_drag_saves
test('a drag saves one place in the layout block, after the graph, and the graph is never rewritten', () => {
  assert.equal(savedPlaces(note(), 'trip').size, 0, 'no layout block: nothing saved');
  const first = placeInNote(note(), 'trip', GRAPH, 'ann', 120.4, 39.6);
  assert.ok('text' in first, JSON.stringify(first));
  assert.ok(first.text.startsWith(note()), 'the note above is as it was');
  assert.match(first.text, /```gql\n\/\/ graph: trip_layout · LAYOUT ON trip\n\(ann:Place \{x: 120, y: 40\}\)\n```$/);
  assert.deepEqual([...savedPlaces(first.text, 'trip')], [['ann', { x: 120, y: 40 }]]);
  // a second drag rewrites that block alone: one place each, the first kept
  const second = placeInNote(first.text, 'trip', GRAPH, 'bob', -5, 7);
  assert.equal(second.text.match(/LAYOUT ON/g).length, 1, 'one layout block');
  assert.deepEqual(Object.fromEntries(savedPlaces(second.text, 'trip')), {
    ann: { x: 120, y: 40 },
    bob: { x: -5, y: 7 },
  });
  // the graph the person saw is gone: nothing is written
  const changed = note().replace("'Bob'", "'Robert'");
  assert.ok('refused' in placeInNote(changed, 'trip', GRAPH, 'ann', 1, 1));
  // another graph's layout is not this one's
  assert.equal(savedPlaces(second.text, 'other').size, 0);
});

// proves: layout_drag_saves
test('saved places put their things there, and every other spot stays where the rooms put it', () => {
  const thing = (key, subject) => ({ key, text: key, kinds: ['Item'], texts: new Map([['subject', subject]]) });
  const things = ['a1', 'a2', 'a3', 'b1', 'b2'].map((k) => thing(k, k[0] === 'a' ? 'A' : 'B'));
  const scene = sceneOf({ things, links: [] });
  const plain = roomsOf(scene);
  const placed = roomsOf(scene, new Map([['a2', { x: 999, y: -40 }]]));
  assert.deepEqual([placed.get('a2').x, placed.get('a2').y], [999, -40]);
  for (const [key, spot] of plain) if (key !== 'a2') assert.deepEqual(placed.get(key), spot, `${key} stays put`);
});

// proves: layout_drag_saves
test('on the stage, dragging an item moves it alone and saves its place; dragging empty ground pans', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { RenderStage } = await import('../src/display/graph-view/render-stage.ts');
    const boxes = [],
      props = new Map();
    for (const subject of ['Work', 'Money'])
      for (let i = 0; i < 6; i++) {
        const key = `${subject[0]}${i}`;
        boxes.push({ key, text: key, label: key, kinds: ['Item'] });
        props.set(key, { name: key, subject, area: `${subject}${i % 2}` });
      }
    const viewport = doc.createElement('div');
    doc.body.appendChild(viewport);
    (viewport.win ?? globalThis).matchMedia = (q) => ({ matches: q.includes('reduce') });
    const saved = [];
    const stage = new RenderStage(
      viewport,
      { boxes, links: [], estimates: [] },
      { nodes: props, p: (k) => props.get(k) },
      { open() {}, clear() {}, selected: () => null },
      'off',
      { saved: new Map(), place: (key, x, y) => saved.push([key, x, y]) },
    );
    const kept = new Map([...stage.spots].map(([k, s]) => [k, { ...s }]));
    const drag = (from, to) => {
      const e = (x, y) => ({ clientX: x, clientY: y, pointerId: 1, button: 0, stopPropagation() {} });
      stage.down(e(...from));
      stage.move(e(...to));
      stage.up(e(...to));
    };
    // close enough that items show, then grab one where it is drawn
    const scale = stage.view.scale * 8,
      w0 = stage.spots.get('W0');
    stage.view = { ...stage.view, scale, x: w0.x - stage.view.w / 2 / scale, y: w0.y - stage.view.h / 2 / scale };
    stage.draw();
    const dot = stage.marks.find(
      (m) => m.kind === 'dot' && m.x > 0 && m.y > 0 && m.x < stage.view.w && m.y < stage.view.h,
    );
    assert.ok(dot, 'an item shows');
    const view = stage.view;
    drag([dot.x, dot.y], [dot.x + 40, dot.y + 16]);
    assert.deepEqual(stage.view, view, 'moving an item does not move the camera');
    const was = kept.get(dot.key),
      now = stage.spots.get(dot.key);
    assert.ok(Math.abs(now.x - was.x - 40 / view.scale) < 1e-6 && Math.abs(now.y - was.y - 16 / view.scale) < 1e-6);
    assert.deepEqual(saved, [[dot.key, now.x, now.y]], 'its place is saved once, when let go');
    for (const [key, spot] of kept) if (key !== dot.key) assert.deepEqual(stage.spots.get(key), spot, 'nothing else');
    // empty ground still pans, and saves nothing
    drag([2, 2], [30, 30]);
    assert.notEqual(stage.view.x, view.x);
    assert.equal(saved.length, 1);
    stage.unload();
  } finally {
    uninstall();
  }
});

// proves: layout_drag_saves, move_undo
test('one undo takes a saved place back: a new place is forgotten, a moved one goes back, and redo puts it again', async () => {
  // in the note: forgetting a place takes its line out, and nothing else
  const one = placeInNote(note(), 'trip', GRAPH, 'ann', 1, 2).text;
  const two = placeInNote(one, 'trip', GRAPH, 'bob', 3, 4).text;
  const back = forgetInNote(two, 'trip', GRAPH, 'bob');
  assert.deepEqual(Object.fromEntries(savedPlaces(back.text, 'trip')), { ann: { x: 1, y: 2 } });
  assert.ok('refused' in forgetInNote(two.replace("'Bob'", "'Rob'"), 'trip', GRAPH, 'bob'), 'the graph changed');
  // on the stage: Ctrl+Z after a drag
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { RenderStage } = await import('../src/display/graph-view/render-stage.ts');
    const boxes = [],
      props = new Map();
    for (let i = 0; i < 6; i++)
      for (const subject of ['Work', 'Money']) {
        const key = `${subject[0]}${i}`;
        boxes.push({ key, text: key, label: key, kinds: ['Item'] });
        props.set(key, { name: key, subject, area: `${subject}${i % 2}` });
      }
    const viewport = doc.createElement('div');
    doc.body.appendChild(viewport);
    (viewport.win ?? globalThis).matchMedia = (q) => ({ matches: q.includes('reduce') });
    const writes = [];
    const stage = new RenderStage(
      viewport,
      { boxes, links: [], estimates: [] },
      { nodes: props, p: (k) => props.get(k) },
      { open() {}, clear() {}, selected: () => null },
      'off',
      {
        graph: 'undo-trip',
        saved: new Map(),
        place: async (key, x, y) => (writes.push(['place', key, x, y]), null),
        forget: async (key) => (writes.push(['forget', key]), null),
      },
    );
    const scale = stage.view.scale * 8,
      w0 = stage.spots.get('W0');
    stage.view = { ...stage.view, scale, x: w0.x - stage.view.w / 2 / scale, y: w0.y - stage.view.h / 2 / scale };
    stage.draw();
    const dot = stage.marks.find(
      (m) => m.kind === 'dot' && m.x > 0 && m.y > 0 && m.x < stage.view.w && m.y < stage.view.h,
    );
    const was = { ...stage.spots.get(dot.key) };
    const drag = (dx) => {
      const at = stage.marks.find((m) => m.kind === 'dot' && m.key === dot.key);
      const e = (x, y) => ({ clientX: x, clientY: y, pointerId: 1, button: 0, stopPropagation() {} });
      stage.down(e(at.x, at.y));
      stage.move(e(at.x + dx, at.y));
      stage.up(e(at.x + dx, at.y));
    };
    const key = (init) => viewport.dispatch('keydown', { key: 'z', ctrlKey: true, ...init });
    const settle = () => new Promise((r) => setTimeout(r, 5));
    drag(40);
    const moved = { ...stage.spots.get(dot.key) };
    const toast = viewport.querySelector('.thoughtknot-undo-toast');
    assert.ok(toast && !toast.classList.contains('is-hidden'), 'the toast offers its undo');
    const undo = key();
    assert.ok(undo.defaultPrevented, "Ctrl+Z is the stage's");
    await settle();
    assert.deepEqual(stage.spots.get(dot.key), was, 'back where the rooms put it');
    assert.deepEqual(writes.at(-1), ['forget', dot.key], 'a place it never had is forgotten');
    key({ shiftKey: true });
    await settle();
    assert.deepEqual(stage.spots.get(dot.key), moved, 'redo puts it back');
    assert.deepEqual(writes.at(-1), ['place', dot.key, moved.x, moved.y]);
    // a second drag of a placed item: its undo writes the place it had
    drag(30);
    key();
    await settle();
    assert.deepEqual(stage.spots.get(dot.key), moved);
    assert.deepEqual(writes.at(-1), ['place', dot.key, moved.x, moved.y]);
    // the card's other Ctrl+Z on the same history sees the key taken: one press undoes once
    let other = 0;
    viewport.addEventListener('keydown', (e) => !e.defaultPrevented && other++);
    drag(20);
    key();
    await settle();
    assert.equal(other, 0, 'no second undo');
    // a field being typed in keeps its own Ctrl+Z, and a key another handler took is left alone
    const field = viewport.createEl('input');
    assert.equal(field.dispatch('keydown', { key: 'z', ctrlKey: true }).defaultPrevented, false);
    stage.unload();
  } finally {
    uninstall();
  }
});
