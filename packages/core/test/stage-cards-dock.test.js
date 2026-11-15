// The arrangements of the cards saved by name (editor spec §73, render_cards): display/graph-view/stage-cards-dock.ts.
// Roger, 15 Nov 2026: start customising the view, positioning and layout. An arrangement keeps every card's size,
// width and pin. It is saved in the layout block, and put back in one step that one undo takes back.
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
test('an arrangement of the cards is saved by name, put back in one step that undoes, and forgotten', async () => {
  const { fakeDocument, installGlobals } = await import('../../obsidian/test/host/fake-dom.js');
  const doc = fakeDocument(800),
    uninstall = installGlobals(doc);
  try {
    const { installHost } = await import('../src/display/host.ts');
    installHost({ icon: () => {}, isPhone: () => false, notice: () => {}, menu: () => {} });
    const { RenderStage } = await import('../src/display/graph-view/render-stage.ts');
    const { cardsControl } = await import('../src/display/graph-view/stage-cards-switch.ts');
    const { MoveUndo } = await import('../src/display/graph-view/move-undo.ts');
    const { CARD_HEAD } = await import('../src/render/render-cards.ts');
    const { drawing, g } = drawingAndGraph();
    const [cardsWritten, setsWritten] = [[], []];
    const places = {
      saved: new Map(),
      place: () => {},
      cards: new Map(),
      card: (key, c) => void cardsWritten.push([key, c]),
      arrangements: new Map(),
      arrange: (name, cards) => void setsWritten.push([name, cards]),
      graph: 'set-plan',
    };
    const root = doc.createElement('div');
    doc.body.appendChild(root);
    const dock = root.createDiv({ cls: 'thoughtknot-view-dock' }).createDiv({ cls: 'thoughtknot-dock-body' });
    const viewport = root.createDiv();
    const stage = new RenderStage(viewport, drawing, g, undefined, 'always', places);
    cardsControl(root, stage, 'set-plan');
    const [cardsButton, setsButton] = dock.querySelectorAll('button');
    assert.ok(setsButton.hidden, 'no arrangements while the cards are off');
    cardsButton.click();
    assert.ok(!setsButton.hidden);
    setsButton.click();
    const bar = () => viewport.querySelector('.thoughtknot-stage-cards-sets');
    const press = (label) =>
      bar()
        .querySelectorAll('button')
        .find((b) => b.getAttribute('aria-label') === label)
        .click();
    assert.ok(bar(), 'its button opens the bar');
    const sw = stage.cardsOn;
    // a card shrunk to its name, and one pinned: saved as Tidy
    sw.fit('W1', 'title');
    sw.pin(['W0']);
    press('Save this arrangement');
    bar().querySelector('input').value = 'Tidy';
    press('Save');
    const [name, saved] = setsWritten.at(-1);
    assert.equal(name, 'Tidy');
    assert.equal(saved.size, 6, 'every card is in it');
    assert.equal(saved.get('W1').fit, 'title');
    assert.equal(saved.get('W0').placed, true);
    assert.ok(!saved.get('H0').placed && !saved.get('H0').fit, 'a card as laid keeps only its place');
    assert.ok(
      bar()
        .querySelectorAll('option')
        .some((o) => o.value === 'Tidy'),
      'the list holds it now',
    );
    // the cards changed again, then Tidy put back in one step: one write, and no card written alone
    sw.fit('W1', undefined);
    sw.unpin(['W0']);
    assert.ok(!cardEl(viewport, 'Work 0').hasClass('is-pinned'));
    const wrote = cardsWritten.length;
    const list = bar().querySelector('select');
    list.value = 'Tidy';
    list.dispatchEvent(new Event('change'));
    assert.deepEqual(setsWritten.at(-1), ['Tidy', 'use']);
    assert.equal(cardsWritten.length, wrote, 'the host saves it in one write');
    assert.equal(boxesOf(stage).get('W1').h, CARD_HEAD, 'its name only, as saved');
    assert.ok(cardEl(viewport, 'Work 0').hasClass('is-pinned'), 'pinned, as saved');
    for (const [k, b] of boxesOf(stage))
      for (const [j, c] of boxesOf(stage)) if (k < j) assert.ok(!covers(b, c), `${k} and ${j} do not overlap`);
    // one undo puts the cards back as they were
    assert.ok(new MoveUndo(viewport, 'set-plan').undo());
    for (let i = 0; i < 3; i++) await Promise.resolve(); // the undo's toast says so before the page goes
    assert.ok(boxesOf(stage).get('W1').h > CARD_HEAD, 'first lines again');
    assert.ok(!cardEl(viewport, 'Work 0').hasClass('is-pinned'), 'unpinned again');
    // forgotten, it goes from the list and the note
    bar().querySelector('select').value = 'Tidy';
    press('Forget the arrangement picked');
    assert.deepEqual(setsWritten.at(-1), ['Tidy', null]);
    assert.ok(
      !bar()
        .querySelectorAll('option')
        .some((o) => o.value === 'Tidy'),
    );
    // Cards off closes the bar
    cardsButton.click();
    assert.equal(bar(), null);
    assert.ok(setsButton.hidden);
    for (let i = 0; i < 3; i++) await Promise.resolve();
    stage.unload();
  } finally {
    uninstall();
  }
});
