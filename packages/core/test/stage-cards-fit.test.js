// Each card sized by its reader (editor spec §73, render_cards): display/graph-view/stage-cards-fit.ts. Roger, 15 Nov
// 2026: a card shrinks to its name or grows to all it holds, card by card. The card sized keeps its place, the cards
// round it make room, and no card lies over another.
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** Two subjects of three things, linked in a line; W1 has a long note. */
function drawingAndGraph() {
  const boxes = [],
    props = new Map(),
    keys = [];
  const long = Array.from({ length: 30 }, (_, i) => `Line ${i} of the long note.`).join('\n\n');
  for (const subject of ['Work', 'Home'])
    for (let i = 0; i < 3; i++) {
      const key = `${subject[0]}${i}`;
      keys.push(key);
      const text = key === 'W1' ? long : `Note of ${key}.\n\nMore.`;
      boxes.push({ key, kind: 'Task', text: `${subject} ${i}`, note: { text, summary: '' } });
      props.set(key, { name: `${subject} ${i}`, subject });
    }
  const links = keys.slice(1).map((to, i) => ({ from: keys[i], to, type: 'NEXT', reading: 'next' }));
  const g = { nodes: props, p: (k) => props.get(k) };
  return { drawing: { boxes, links, estimates: [] }, g, keys };
}

/** Each card's box in the drawing, as last laid. */
const boxesOf = (stage) => new Map(stage.cardsOn.cards.laid.cards.map((c) => [c.key, c]));
/** Whether two cards in the drawing cover one another. */
const covers = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
const cardEl = (viewport, name) =>
  viewport.querySelectorAll('.thoughtknot-stage-card').find((el) => el.textContent.includes(name));

// proves: render_cards
test('a card shrinks to its name or grows to all it holds, keeping its place while the cards round it make room', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { installHost } = await import('../src/display/host.ts');
    installHost({ icon: () => {}, isPhone: () => false, notice: () => {}, menu: () => {} });
    const { RenderStage } = await import('../src/display/graph-view/render-stage.ts');
    const { cardsControl } = await import('../src/display/graph-view/stage-cards-switch.ts');
    const { CARD_HEAD } = await import('../src/render/render-cards.ts');
    const { drawing, g, keys } = drawingAndGraph();
    const root = doc.createElement('div');
    doc.body.appendChild(root);
    const dock = root.createDiv({ cls: 'thoughtknot-view-dock' }).createDiv({ cls: 'thoughtknot-dock-body' });
    const viewport = root.createDiv();
    const stage = new RenderStage(viewport, drawing, g, { open: () => {}, clear: () => {}, selected: () => null });
    cardsControl(root, stage, 'fit-plan');
    dock.querySelector('button').click();
    const was = boxesOf(stage);
    const top = (c) => c.y - c.h / 2;
    // W1 grows to all it holds: taller, the same top and middle, and the cards round it move aside
    const w1 = cardEl(viewport, 'Work 1');
    w1.querySelector('button.thoughtknot-stage-card-more').click();
    let now = boxesOf(stage);
    assert.ok(now.get('W1').h > was.get('W1').h, 'taller');
    assert.ok(Math.abs(now.get('W1').x - was.get('W1').x) < 1e-6, 'it keeps its place across');
    assert.ok(Math.abs(top(now.get('W1')) - top(was.get('W1'))) < 1e-6, 'and its top edge');
    for (const a of keys)
      for (const b of keys) if (a < b) assert.ok(!covers(now.get(a), now.get(b)), `${a} clear of ${b}`);
    assert.ok(w1.hasClass('is-full'));
    assert.equal(w1.querySelector('button.thoughtknot-stage-card-more').getAttribute('aria-expanded'), 'true');
    for (const k of keys) {
      const s = stage.spots.get(k);
      assert.ok(Math.abs(s.x - now.get(k).x) < 1e-6 && Math.abs(s.y - now.get(k).y) < 1e-6, `${k} where its card is`);
    }
    // H2 shrinks to its name only, and back
    const h2 = cardEl(viewport, 'Home 2');
    const fit = h2.querySelector('button.thoughtknot-stage-card-fit');
    assert.equal(fit.getAttribute('aria-label'), 'Name only');
    fit.click();
    now = boxesOf(stage);
    assert.equal(now.get('H2').h, CARD_HEAD, 'its name only');
    assert.ok(h2.hasClass('is-title'));
    assert.equal(fit.getAttribute('aria-label'), 'Show the card');
    // each card keeps the size it was given when Cards is turned off and on again
    dock.querySelector('button').click();
    dock.querySelector('button').click();
    now = boxesOf(stage);
    assert.equal(now.get('H2').h, CARD_HEAD, 'still its name only');
    assert.ok(now.get('W1').h > was.get('W1').h, 'still all of it');
    cardEl(viewport, 'Home 2').querySelector('button.thoughtknot-stage-card-fit').click();
    assert.equal(boxesOf(stage).get('H2').h, was.get('H2').h, 'the whole card again');
    stage.unload();
  } finally {
    uninstall();
  }
});

// proves: render_cards
test('a card pinned stays put while the cards it covers move aside the whole way, in rooms too', async () => {
  const { keepInRooms } = await import('../src/render/render-cards-rooms.ts');
  const box = (key, x, y, h) => ({ key, x, y, w: 240, h });
  // a card grown down over the one below: only the one below moves
  const flat = { depths: ['i'], nodes: new Map(), roots: [], named: [], roads: [[]] };
  const cards = [box('a', 0, 0, 300), box('b', 0, 100, 60), box('c', 1000, 0, 60)];
  keepInRooms(flat, new Map(), cards, new Set(['a']));
  const at = new Map(cards.map((b) => [b.key, b]));
  assert.deepEqual([at.get('a').x, at.get('a').y], [0, 0], 'the pinned card stays');
  assert.ok(at.get('b').y - 30 >= 150, 'the one below moves clear of it');
  assert.deepEqual([at.get('c').x, at.get('c').y], [1000, 0], 'a card it does not cover stays');
  // in rooms, the room holding the pinned card stays, and the room it now covers moves
  const nodes = new Map([
    ['A', { key: 'A', name: 'A', depth: 0, children: ['a'], items: ['a'] }],
    ['B', { key: 'B', name: 'B', depth: 0, children: ['b'], items: ['b'] }],
    ['a', { key: 'a', name: 'a', depth: 1, parent: 'A', children: [], items: ['a'] }],
    ['b', { key: 'b', name: 'b', depth: 1, parent: 'B', children: [], items: ['b'] }],
  ]);
  const scene = { depths: ['g', 'i'], nodes, roots: ['A', 'B'], named: ['A', 'B'], roads: [[], []] };
  const spots = new Map([
    ['A', { x: 0, y: 0, r: 10 }],
    ['B', { x: 0, y: 200, r: 10 }],
  ]);
  const two = [box('a', 0, 0, 300), box('b', 0, 200, 60)];
  keepInRooms(scene, spots, two, new Set(['a']));
  assert.deepEqual([spots.get('A').x, spots.get('A').y], [0, 0], 'the room holding it stays');
  const [A, B] = [spots.get('A'), spots.get('B')];
  assert.ok(Math.hypot(A.x - B.x, A.y - B.y) >= A.r + B.r, 'the other room moved clear');
});

// proves: render_cards
test('a card dragged by its head stays where it is put, the cards it lands on move aside, and the move undoes', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { installHost } = await import('../src/display/host.ts');
    installHost({ icon: () => {}, isPhone: () => false, notice: () => {}, menu: () => {} });
    const { RenderStage } = await import('../src/display/graph-view/render-stage.ts');
    const { cardsControl } = await import('../src/display/graph-view/stage-cards-switch.ts');
    const { MoveUndo } = await import('../src/display/graph-view/move-undo.ts');
    const { drawing, g, keys } = drawingAndGraph();
    const root = doc.createElement('div');
    doc.body.appendChild(root);
    const dock = root.createDiv({ cls: 'thoughtknot-view-dock' }).createDiv({ cls: 'thoughtknot-dock-body' });
    const viewport = root.createDiv();
    const stage = new RenderStage(viewport, drawing, g, { open: () => {}, clear: () => {}, selected: () => null });
    cardsControl(root, stage, 'drag-plan');
    dock.querySelector('button').click();
    const w0 = stage.spots.get('W0');
    stage.view = { ...stage.view, scale: 1, x: w0.x - 400, y: w0.y - 300 };
    stage.draw();
    const el = cardEl(viewport, 'Work 0');
    const [x, y] = ['x', 'y'].map((a) => parseFloat(el.cssProps[`--thoughtknot-card-${a}`]));
    const sw = stage.cardsOn;
    assert.equal(
      sw.grab(x + 20, y + 60, () => stage.view),
      false,
      'its body does not take it: the stage pans',
    );
    assert.ok(
      sw.grab(x + 20, y + 10, () => stage.view),
      'its head takes it',
    );
    // dropped right on W2, which moves aside; W0 stays where it was put
    const target = boxesOf(stage).get('W2');
    const from = { ...stage.spots.get('W0') };
    sw.drag(target.x - from.x, target.y - from.y);
    sw.drop();
    const now = boxesOf(stage);
    assert.ok(Math.abs(now.get('W0').x - target.x) < 1e-6 && Math.abs(now.get('W0').y - target.y) < 1e-6, 'W0 stays');
    for (const a of keys)
      for (const b of keys) if (a < b) assert.ok(!covers(now.get(a), now.get(b)), `${a} clear of ${b}`);
    // turned off and on, it is still where it was put
    dock.querySelector('button').click();
    dock.querySelector('button').click();
    const again = boxesOf(stage).get('W0');
    assert.ok(Math.abs(again.x - target.x) < 1e-6 && Math.abs(again.y - target.y) < 1e-6, 'kept for the graph');
    // undone, it goes back where the layout had it
    assert.ok(new MoveUndo(viewport, 'drag-plan').undo());
    for (let i = 0; i < 3; i++) await Promise.resolve(); // the undo's toast says so before the page goes
    const back = boxesOf(stage).get('W0');
    assert.ok(Math.abs(back.x - from.x) < 1e-6 && Math.abs(back.y - from.y) < 1e-6, 'back where it was');
    stage.unload();
  } finally {
    uninstall();
  }
});

// proves: render_cards
test('each card is drawn as saved in the layout block, and its size and place are saved there, apart from its dot', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { installHost } = await import('../src/display/host.ts');
    installHost({ icon: () => {}, isPhone: () => false, notice: () => {}, menu: () => {} });
    const { RenderStage } = await import('../src/display/graph-view/render-stage.ts');
    const { cardsControl } = await import('../src/display/graph-view/stage-cards-switch.ts');
    const { CARD_HEAD } = await import('../src/render/render-cards.ts');
    const { drawing, g } = drawingAndGraph();
    const written = [];
    const places = {
      saved: new Map(),
      place: () => {},
      cards: new Map([['H2', { x: 0, y: 0, fit: 'title' }]]),
      card: (key, c) => void written.push([key, c]),
      graph: 'saved-plan',
    };
    const root = doc.createElement('div');
    doc.body.appendChild(root);
    const dock = root.createDiv({ cls: 'thoughtknot-view-dock' }).createDiv({ cls: 'thoughtknot-dock-body' });
    const viewport = root.createDiv();
    const stage = new RenderStage(viewport, drawing, g, undefined, 'always', places);
    cardsControl(root, stage, 'saved-plan');
    dock.querySelector('button').click();
    assert.equal(boxesOf(stage).get('H2').h, CARD_HEAD, 'drawn as saved: its name only');
    // sized again, it is saved: shown whole, its line is forgotten
    cardEl(viewport, 'Home 2').querySelector('button.thoughtknot-stage-card-fit').click();
    assert.deepEqual(written.at(-1), ['H2', null]);
    // put by hand, it is saved there, placed, in the layout's own places; the dot's place is never written
    const w0 = stage.spots.get('W0');
    stage.view = { ...stage.view, scale: 1, x: w0.x - 400, y: w0.y - 300 };
    stage.draw();
    const el = cardEl(viewport, 'Work 0');
    const [x, y] = ['x', 'y'].map((a) => parseFloat(el.cssProps[`--thoughtknot-card-${a}`]));
    assert.ok(stage.cardsOn.grab(x + 20, y + 10, () => stage.view));
    stage.cardsOn.drag(0, 500);
    stage.cardsOn.drop();
    const [key, c] = written.at(-1);
    assert.equal(key, 'W0');
    assert.equal(c.placed, true);
    const { spread, cy } = stage.cardsOn.cards.laid;
    assert.ok(Math.abs(c.y - (cy + (w0.y + 500 - cy) / spread)) < 1e-6, 'in the layout own places, before spreading');
    assert.equal(places.saved.size, 0, 'no dot place is saved');
    for (let i = 0; i < 3; i++) await Promise.resolve(); // the undo's toast says so before the page goes
    stage.unload();
  } finally {
    uninstall();
  }
});

// proves: render_cards
test('cards chosen together with Shift take one step at once: name only, first lines or all they hold', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { installHost } = await import('../src/display/host.ts');
    installHost({ icon: () => {}, isPhone: () => false, notice: () => {}, menu: () => {} });
    const { RenderStage } = await import('../src/display/graph-view/render-stage.ts');
    const { cardsControl } = await import('../src/display/graph-view/stage-cards-switch.ts');
    const { CARD_HEAD } = await import('../src/render/render-cards.ts');
    const { CardChoice, sharedStep } = await import('../src/card-choice.ts');
    const { drawing, g, keys } = drawingAndGraph();
    const root = doc.createElement('div');
    doc.body.appendChild(root);
    const dock = root.createDiv({ cls: 'thoughtknot-view-dock' }).createDiv({ cls: 'thoughtknot-dock-body' });
    const viewport = root.createDiv();
    const stage = new RenderStage(viewport, drawing, g, { open: () => {}, clear: () => {}, selected: () => null });
    cardsControl(root, stage, 'choose-plan');
    dock.querySelector('button').click();
    const was = boxesOf(stage);
    const w0 = stage.spots.get('W0');
    stage.view = { ...stage.view, scale: 1, x: w0.x - 400, y: w0.y - 300 };
    stage.draw();
    const el = cardEl(viewport, 'Work 0');
    const [x, y] = ['x', 'y'].map((a) => parseFloat(el.cssProps[`--thoughtknot-card-${a}`]));
    const box = { left: 0, top: 0 };
    const sw = stage.cardsOn;
    const bar = () => viewport.querySelector('.thoughtknot-stage-cards-chosen');
    const press = (label) =>
      bar()
        .querySelectorAll('button')
        .find((b) => b.getAttribute('aria-label') === label)
        .click();
    // Shift chooses the card, and the bar comes; a plain click lets it go, and the stage takes that click
    assert.ok(sw.chose({ shiftKey: true, clientX: x + 20, clientY: y + 10 }, box), 'Shift takes the click');
    assert.ok(el.hasClass('is-chosen'));
    assert.match(bar().textContent, /1 chosen/);
    assert.equal(sw.chose({ clientX: x + 20, clientY: y + 10 }, box), false, 'a plain click is the stage own');
    assert.equal(bar(), null, 'none chosen, no bar');
    assert.ok(!el.hasClass('is-chosen'));
    // every card, then all to their names at once: none covers another
    sw.chose({ metaKey: true, clientX: x + 20, clientY: y + 10 }, box);
    press('Choose every card');
    assert.match(bar().textContent, /6 chosen/);
    press('Name only');
    let now = boxesOf(stage);
    for (const k of keys) assert.equal(now.get(k).h, CARD_HEAD, `${k} its name only`);
    assert.equal(
      bar()
        .querySelectorAll('button')
        .find((b) => b.getAttribute('aria-label') === 'Name only')
        .getAttribute('aria-pressed'),
      'true',
    );
    // all they hold: the long note is taller than its first lines; then first lines again, as they were
    press('All it holds');
    now = boxesOf(stage);
    assert.ok(now.get('W1').h > was.get('W1').h, 'the long note in full');
    for (const a of keys)
      for (const b of keys) if (a < b) assert.ok(!covers(now.get(a), now.get(b)), `${a} clear of ${b}`);
    press('First lines');
    now = boxesOf(stage);
    for (const k of keys) assert.equal(now.get(k).h, was.get(k).h, `${k} its first lines`);
    press('Clear the choice');
    assert.equal(bar(), null);
    // the choice itself: toggled in and out, and the step the chosen share
    const c = new CardChoice();
    assert.equal(c.toggle('a'), true);
    assert.equal(c.toggle('b'), true);
    assert.equal(c.toggle('a'), false);
    assert.deepEqual(c.list(), ['b']);
    assert.equal(sharedStep(new Map([['a', { fit: 'full' }]]), ['a', 'b']), null, 'they differ');
    assert.equal(sharedStep(new Map(), ['a', 'b']), 'lines');
    stage.unload();
  } finally {
    uninstall();
  }
});
