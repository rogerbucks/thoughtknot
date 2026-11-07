// The stage moves an item a person drags, saves its place once, and one undo takes that place back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forgetInNote, placeInNote, savedPlaces } from '../src/layout-places.ts';

const GRAPH = "// graph: trip\n(ann:Person {name: 'Ann'}),\n(bob:Person {name: 'Bob'})";
const note = (...more) => ['# Trip', '', '```gql', GRAPH, '```', ...more].join('\n');

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
