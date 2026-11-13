// Cards on and off on the new rendering's stage (editor spec §73, render_cards): display/graph-view/stage-cards-switch.ts.
// The Cards button spreads the drawing to make room for the cards, and draws it back when pressed again. A press
// mid-glide, or the stage going, brings the glide to rest first.
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
test('Cards on spreads the drawing and lays a card over each item; a click picks it; off draws it back', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { installHost } = await import('../src/display/host.ts');
    installHost({ icon: () => {}, isPhone: () => false, notice: () => {}, menu: () => {} });
    const { RenderStage } = await import('../src/display/graph-view/render-stage.ts');
    const { cardsControl } = await import('../src/display/graph-view/stage-cards-switch.ts');
    const { cardsChosen } = await import('../src/display/graph-view/stage-cards.ts');
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

// proves: render_cards
test('a second press mid-glide starts from where the first was going; an unload stops the glide; tilted, dots show', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  const frames = [];
  const had = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (f) => frames.push(f);
  const run = (now) => {
    for (const f of frames.splice(0)) f(now);
  };
  try {
    const { installHost } = await import('../src/display/host.ts');
    installHost({ icon: () => {}, isPhone: () => false, notice: () => {}, menu: () => {} });
    const { RenderStage } = await import('../src/display/graph-view/render-stage.ts');
    const { drawing, g, keys } = drawingAndGraph();
    const viewport = doc.createElement('div');
    doc.body.appendChild(viewport);
    const stage = new RenderStage(viewport, drawing, g, { open: () => {}, clear: () => {}, selected: () => null });
    const before = new Map([...stage.spots].map(([k, s]) => [k, { ...s }]));
    stage.showCards(true);
    run(performance.now() + 50); // part way
    stage.showCards(false); // pressed again before the glide ends
    run(performance.now() + 5000); // the first glide's last frame comes too late: nothing of it is left
    for (const [k, s] of before) {
      const now = stage.spots.get(k);
      assert.ok(Math.abs(now.x - s.x) < 1e-6 && Math.abs(now.y - s.y) < 1e-6, `${k} back where the layout had it`);
    }
    // tilted, the cards hide, so the dots and names stay
    stage.showCards(true, true);
    const spot = stage.spots.get('W1');
    stage.view = { ...stage.view, scale: 1, x: spot.x - 400, y: spot.y - 300, tilt: 0.6 };
    stage.draw();
    assert.ok(
      stage.marks.some((m) => m.kind === 'dot' && keys.includes(m.key)),
      'tilted, no card shows, so its dot does',
    );
    // an unload mid-glide: no frame draws the removed stage
    stage.showCards(false);
    let drawn = 0;
    stage.draw = () => void drawn++;
    stage.unload();
    run(performance.now() + 50);
    assert.equal(drawn, 0, 'nothing draws after the unload');
  } finally {
    globalThis.requestAnimationFrame = had;
    uninstall();
  }
});
