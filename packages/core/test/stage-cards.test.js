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
test('a card shows the note it stands for below its own, rendered by the host once near, and opens with Show all', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { cardTexts, StageCards } = await import('../src/display/graph-view/stage-cards.ts');
    const { cardsLaid } = await import('../src/render/render-cards.ts');
    const { sceneOf } = await import('../src/render/render-scene.ts');
    const { drawing, g } = drawingAndGraph();
    const rendered = [];
    const words = {
      render: async (md, el) => void rendered.push([md, el]),
      linked: (key) => (key === 'W0' ? '![[Plan]]' : undefined),
    };
    const texts = cardTexts(drawing, g, words);
    assert.equal(texts.get('W0').linked, '![[Plan]]', 'the note it is, embedded below its own');
    assert.equal(texts.get('W1').linked, undefined);
    const scene = sceneOf({ things: drawing.boxes.map((b) => ({ key: b.key, text: b.text, kinds: [] })), links: [] });
    const spots = new Map([...scene.nodes.keys()].map((k, i) => [k, { x: i * 300, y: 0, r: 10 }]));
    const laid = cardsLaid(scene, spots, texts, []);
    assert.ok(laid.cards.find((c) => c.key === 'W0').more >= 1, 'a linked note may run long: Show all is offered');
    const viewport = doc.createElement('div');
    const cards = new StageCards(viewport, laid, laid.spots, spots, [], words);
    const look = { faint: '#ccc', ink: '#000' };
    cards.draw({ x: 0, y: 0, scale: 0.05, w: 800, h: 600 }, look, null, () => undefined);
    assert.equal(rendered.length, 0, 'far out nothing is rendered');
    const w0 = laid.spots.get('W0');
    cards.draw({ x: w0.x - 400, y: w0.y - 300, scale: 1, w: 800, h: 600 }, look, null, () => undefined);
    assert.deepEqual(
      rendered.map(([md]) => md).filter((md) => md.includes('W0') || md.includes('Plan')),
      ['Note of W0.\n\nMore.', '![[Plan]]'],
      'near, its own note then the linked one, by the host',
    );
    const card = viewport.querySelectorAll('.thoughtknot-stage-card').find((el) => el.textContent.includes('Work 0'));
    const all = card.querySelector('button.thoughtknot-stage-card-more');
    all.click();
    assert.ok(card.classList.contains('is-open'), 'Show all opens it in place');
    assert.ok(cards.scrolls({ target: card.querySelector('.thoughtknot-stage-card-body') }), 'an open card scrolls');
    all.click();
    assert.ok(!card.classList.contains('is-open'));
    cards.remove();
  } finally {
    uninstall();
  }
});

// proves: render_cards
test('tilted, a card that a nearer one would cover hides, and its dot and name show instead; the chosen one never hides', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { StageCards } = await import('../src/display/graph-view/stage-cards.ts');
    const card = (key, y) => ({ key, x: 0, y, w: 240, h: 120, shown: 3, more: 0, text: { key, name: key } });
    const cards = [card('near', 260), card('far', 0)];
    const spots = new Map(cards.map((c) => [c.key, { x: c.x, y: c.y, r: 120 }]));
    const laid = { spots, cards, arrows: [], spread: 1, cx: 0, cy: 0, depths: new Map() };
    const viewport = doc.createElement('div');
    const stage = new StageCards(viewport, laid, spots, spots, []);
    const look = { faint: '#ccc', ink: '#000' };
    const shownOf = () =>
      viewport
        .querySelectorAll('.thoughtknot-stage-card')
        .filter((el) => !el.hidden)
        .map((el) => el.textContent);
    const flat = { x: -400, y: -200, scale: 1, w: 800, h: 600 };
    stage.draw(flat, look, null, () => undefined);
    assert.deepEqual(shownOf().sort(), ['far', 'near'], 'flat, both cards show: they stand apart');
    const tilted = { ...flat, tilt: 1.2 };
    stage.draw(tilted, look, null, () => undefined);
    assert.equal(shownOf().length, 1, 'tilted, the two would touch: one hides');
    const marks = [
      { kind: 'dot', key: 'far', alpha: 1 },
      { kind: 'dot', key: 'near', alpha: 1 },
    ];
    const hidden = cards.map((c) => c.key).find((k) => !shownOf().includes(k));
    assert.deepEqual(
      stage.under(marks, tilted).map((m) => m.key),
      [hidden],
      'the hidden card gives way to its dot',
    );
    stage.draw(tilted, look, null, () => undefined, hidden);
    assert.ok(shownOf().includes(hidden), 'chosen, it shows, and the other gives way');
    assert.equal(shownOf().length, 1);
    stage.remove();
  } finally {
    uninstall();
  }
});
