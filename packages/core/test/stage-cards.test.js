// The card view on the new rendering's stage (editor spec §73, render_cards): display/graph-view/stage-cards.ts. With
// Cards on, each item shows as a card with its whole note over the canvas. The drawing spreads to make room, and draws
// back when Cards goes off. A click on a card picks its item, and the choice is kept for the graph.
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** Two subjects of three things, linked in a line, each with a note. */
function drawingAndGraph() {
  const boxes = [],
    props = new Map(),
    keys = [];
  for (const subject of ['Work', 'Home'])
    for (let i = 0; i < 3; i++) {
      const key = `${subject[0]}${i}`;
      keys.push(key);
      boxes.push({
        key,
        kind: 'Task',
        text: `${subject} ${i}`,
        note: { text: `Note of ${key}.\n\nMore.`, summary: '' },
      });
      props.set(key, { name: `${subject} ${i}`, subject, area: `${subject} A`, owner: 'Sam' });
    }
  const links = keys.slice(1).map((to, i) => ({ from: keys[i], to, type: 'NEXT', reading: 'next' }));
  const g = { nodes: props, p: (k) => props.get(k) };
  return { drawing: { boxes, links, estimates: [] }, g, keys };
}

// proves: render_cards
test('a card shows its name, kind, whole note and properties, never where the thing sits', async () => {
  const { cardTexts } = await import('../src/display/graph-view/stage-cards.ts');
  const { drawing, g } = drawingAndGraph();
  const t = cardTexts(drawing, g).get('W0');
  assert.deepEqual(t, {
    key: 'W0',
    name: 'Work 0',
    kind: 'Task',
    note: 'Note of W0.\n\nMore.',
    props: [['owner', 'Sam']],
  });
});

// proves: render_cards
test('under the cards only the outermost clouds show, faint: no name, dot or road shows through', async () => {
  const { underCards } = await import('../src/display/graph-view/stage-cards.ts');
  const marks = [
    { kind: 'cloud', key: 'Work', alpha: 1, ring: 1 },
    { kind: 'cloud', key: 'Work A', alpha: 1 },
    { kind: 'dot', key: 'W0', alpha: 1 },
    { kind: 'label', key: 'W0', alpha: 1 },
    { kind: 'label', key: 'Work', alpha: 1 },
    { kind: 'road', a: 'W0', b: 'W1', alpha: 1 },
    { kind: 'road', a: 'Work', b: 'Home', alpha: 1 },
  ];
  const under = underCards(marks, new Set(['Work', 'Home']));
  assert.deepEqual(
    under.map((m) => [m.kind, m.key]),
    [['cloud', 'Work']],
  );
  assert.ok(under[0].alpha < 0.5 && under[0].ring < 0.5, 'the cloud is faint under the cards');
});

// proves: render_cards
test('Cards on spreads the drawing and lays a card over each item; a click picks it; off draws it back', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { installHost } = await import('../src/display/host.ts');
    installHost({ icon: () => {}, isPhone: () => false, notice: () => {}, menu: () => {} });
    const { RenderStage } = await import('../src/display/graph-view/render-stage.ts');
    const { cardsControl, cardsChosen } = await import('../src/display/graph-view/stage-cards.ts');
    const { drawing, g, keys } = drawingAndGraph();
    const root = doc.createElement('div');
    doc.body.appendChild(root);
    const dock = root.createDiv({ cls: 'thoughtknot-view-dock' }).createDiv({ cls: 'thoughtknot-dock-body' });
    const viewport = root.createDiv();
    let picked = null;
    const stage = new RenderStage(viewport, drawing, g, {
      open: (k) => (picked = k),
      clear: () => {},
      selected: () => picked,
    });
    const before = new Map([...stage.spots].map(([k, s]) => [k, { ...s }]));
    const control = cardsControl(root, stage, 'plan');
    const b = dock.querySelector('button');
    assert.equal(b.getAttribute('aria-pressed'), 'false', 'off until chosen');
    b.click();
    assert.equal(b.getAttribute('aria-pressed'), 'true');
    assert.ok(cardsChosen('plan'), 'kept for the graph');
    const cards = viewport.querySelectorAll('.thoughtknot-stage-card');
    assert.equal(cards.length, keys.length, 'one card for each item');
    // spread, every card stands clear of every other
    const at = keys.map((k) => stage.spots.get(k));
    for (let i = 0; i < at.length; i++)
      for (let j = i + 1; j < at.length; j++)
        assert.ok(
          Math.hypot(at[i].x - at[j].x, at[i].y - at[j].y) >
            Math.hypot(before.get(keys[i]).x - before.get(keys[j]).x, before.get(keys[i]).y - before.get(keys[j]).y),
          'spread apart',
        );
    // close enough in to read, a click on a card picks its item, and the stage leaves its dots out
    const spot = stage.spots.get('W1');
    stage.view = { ...stage.view, scale: 1, x: spot.x - 400, y: spot.y - 300 };
    stage.draw();
    assert.ok(!stage.marks.some((m) => m.kind === 'dot' && keys.includes(m.key)), 'the cards stand for the dots');
    stage.clicked(400, 300);
    assert.equal(picked, 'W1');
    // off: the cards go and every place is as the layout had it
    b.click();
    assert.equal(viewport.querySelectorAll('.thoughtknot-stage-card').length, 0);
    for (const [k, s] of before) {
      const now = stage.spots.get(k);
      assert.ok(Math.abs(now.x - s.x) < 1e-6 && Math.abs(now.y - s.y) < 1e-6, `${k} back where it was`);
    }
    control.unload();
    assert.equal(dock.querySelector('button'), null);
    stage.unload();
  } finally {
    uninstall();
  }
});
