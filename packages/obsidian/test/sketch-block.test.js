// Drawing on a graph's card (editor spec §70):
// - Draw offers the tools. A drag with the pen writes a drawings block after the graph, and the stroke is drawn
//   (sketch_drawn). A stroke begun on a thing is pinned to it.
// - Hide drawings hides them all, and Show drawings brings them back (sketch_toggle).
// - A first tap on a drawing selects it and says what it is, with Delete, and leaves the view where it was. A second
//   tap keeps it selected and brings it to the middle of the view (sketch_click_rule). Delete takes it out of the note.
// - Offer as things and links writes what the drawings say as a proposal under the graph, the graph untouched
//   (sketch_to_graph).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, settled, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { PATH, TEAM, card, mouse, noteOf } from './host/drag-steps.js';

before(() => build());

const INKED = `// graph: team_ink · SKETCH ON team
(d1:Ink {pin: 'ann', x: 0, y: 0, points: '0 0 30 10'})`;

const buttonOf = (el, label) => el.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);
const layerOf = (el) => el.querySelector('g.tk-sketch');

/** Drags the pointer `id` along `points`, each a point in the drawing's own units. */
function drag(vp, at, id, points) {
  const [first, ...rest] = points.map(([x, y]) => at(x, y));
  vp.dispatch('pointerdown', mouse(id, vp, first));
  for (const p of rest) vp.dispatch('pointermove', mouse(id, vp, p));
  vp.dispatch('pointerup', mouse(id, vp, rest.at(-1) ?? first));
}

describe('drawing on the card', () => {
  // proves: sketch_drawn
  test('a pen stroke begun on a thing writes a drawings block after the graph, pinned to it, and draws it', async () => {
    const { env, el, vp, at, placeOf } = await card(noteOf(TEAM));
    try {
      buttonOf(el, 'Draw').click();
      assert.ok(buttonOf(el, 'Pen'), 'the tools are offered');
      assert.equal(buttonOf(el, 'Pen').getAttribute('aria-pressed'), 'true', 'the pen is chosen first');
      assert.ok(el.querySelector('svg.thoughtknot-svg').classList.contains('is-sketching'));
      const p = placeOf('ann');
      drag(vp, at, 1, [
        [p.x, p.y],
        [p.x + 10, p.y + 2],
        [p.x + 20, p.y + 8],
        [p.x + 40, p.y + 20],
      ]);
      await until(() => /SKETCH ON team/.test(env.state.files.get(PATH)));
      await settled();
      const now = env.state.files.get(PATH);
      assert.ok(now.includes(fence(TEAM)), 'the graph untouched');
      assert.ok(now.indexOf('SKETCH ON team') > now.indexOf('// graph: team\n'), 'the drawings come after the graph');
      assert.match(
        now,
        /\/\/ graph: team_ink · SKETCH ON team\n\(d1:Ink \{x: 0, y: 0, pin: 'ann', points: '0 0 [\d -]+'\}\)/,
      );
      assert.ok(layerOf(el)?.querySelector('[data-sketch]'), 'the stroke is drawn on the card');
      assert.equal(el.querySelector('.tk-sketch-preview'), null, 'the line drawn while dragging is gone');
    } finally {
      env.uninstall();
    }
  });

  // proves: sketch_drawn
  test('Escape drops a stroke under way, and writes nothing', async () => {
    const { env, el, vp, at, placeOf, writes } = await card(noteOf(TEAM));
    try {
      buttonOf(el, 'Draw').click();
      const p = placeOf('bob');
      vp.dispatch('pointerdown', mouse(2, vp, at(p.x, p.y)));
      vp.dispatch('pointermove', mouse(2, vp, at(p.x + 30, p.y + 30)));
      assert.ok(el.querySelector('.tk-sketch-preview'), 'shown while drawn');
      assert.ok(vp.dispatch('keydown', { key: 'Escape' }).defaultPrevented);
      assert.equal(el.querySelector('.tk-sketch-preview'), null);
      vp.dispatch('pointerup', mouse(2, vp, at(p.x + 30, p.y + 30)));
      assert.deepEqual(writes, [], 'nothing written');
    } finally {
      env.uninstall();
    }
  });
});

describe('the drawings already in the note', () => {
  // proves: sketch_toggle
  test('Hide drawings hides them all, and Show drawings brings them back', async () => {
    const { env, el } = await card(noteOf(TEAM, INKED));
    try {
      assert.ok(layerOf(el)?.querySelector('[data-sketch]'), 'drawn on the card');
      buttonOf(el, 'Hide drawings').click();
      assert.equal(layerOf(el), null, 'hidden');
      assert.equal(buttonOf(el, 'Show drawings').getAttribute('aria-pressed'), 'true');
      buttonOf(el, 'Show drawings').click();
      assert.ok(layerOf(el)?.querySelector('[data-sketch]'), 'back again');
    } finally {
      env.uninstall();
    }
  });

  // proves: sketch_click_rule
  test('a first tap selects a drawing and says what it is; a second centres it; Delete takes it out', async () => {
    const { env, el, vp, at, placeOf } = await card(noteOf(TEAM, INKED));
    try {
      const ink = layerOf(el).querySelector('[data-sketch]');
      const tap = (id) => {
        vp.dispatch('pointerdown', mouse(id, ink, at(0, 0)));
        vp.dispatch('pointerup', mouse(id, ink, at(0, 0)));
      };
      // the drawing's middle, on the screen, from the viewport's middle across
      const offMiddle = () => Math.abs(at(placeOf('ann').x + 15, placeOf('ann').y + 5).clientX - vp.clientWidth / 2);
      for (let i = 0; i < 6; i++) labelled(el, 'Zoom in').click(); // so the drawing is larger than the view
      const was = offMiddle();
      tap(3);
      assert.equal(offMiddle(), was, 'the first tap leaves the view where it was');
      assert.ok(layerOf(el).querySelector('[data-sketch]').classList.contains('is-selected'), 'selected');
      assert.match(el.querySelector('.thoughtknot-sketch-tools .thoughtknot-walk-said').textContent, /^Selected: /);
      assert.equal(el.querySelector('.thoughtknot-details').hidden, true, 'a drawing is not a thing: nothing opens');
      tap(4);
      assert.ok(layerOf(el).querySelector('[data-sketch]').classList.contains('is-selected'), 'still selected');
      assert.ok(offMiddle() < 2 && was > 2, `in the middle: ${offMiddle()} from it, ${was} before`);
      buttonOf(el, 'Delete drawing').click();
      await until(() => !/\(d1:Ink/.test(env.state.files.get(PATH)));
      await settled();
      assert.ok(env.state.files.get(PATH).includes(fence(TEAM)), 'the graph untouched');
      assert.equal(layerOf(el), null, 'no drawings left to draw');
    } finally {
      env.uninstall();
    }
  });
});

describe('drawings offered as things and links', () => {
  // proves: sketch_to_graph
  test('an arrow drawn from one thing to another is offered as a link under the graph, the graph untouched', async () => {
    const { env, el, vp, at, placeOf } = await card(noteOf(TEAM));
    try {
      buttonOf(el, 'Draw').click();
      buttonOf(el, 'Arrow').click();
      const [a, c] = [placeOf('ann'), placeOf('cy')];
      drag(vp, at, 6, [
        [a.x, a.y],
        [c.x, c.y],
      ]);
      await until(() => /SKETCH ON team/.test(env.state.files.get(PATH)));
      await settled();
      buttonOf(el, 'Done drawing').click();
      buttonOf(el, 'Offer as things and links').click();
      await until(() => /sketch_1/.test(env.state.files.get(PATH)));
      await settled();
      const now = env.state.files.get(PATH);
      assert.ok(now.includes(fence(TEAM)), 'the graph untouched: the link waits to be accepted');
      assert.match(now, /\(ann\)-\[:ASKS\]->\(cy\)/, 'offered as a link of the graph’s usual type');
      assert.match(el.querySelector('.thoughtknot-sketch-tools .thoughtknot-walk-said').textContent, /^Offered /);
    } finally {
      env.uninstall();
    }
  });
});

describe('drawing by keyboard', () => {
  // proves: sketch_keyboard
  test('a tool draws on the thing selected on the card, and says to select one first', async () => {
    const { env, el, vp, at, boxOf, placeOf } = await card(noteOf(TEAM));
    try {
      buttonOf(el, 'Draw').click();
      buttonOf(el, 'Ellipse').click();
      buttonOf(el, 'Draw on the selected thing').click();
      assert.equal(
        el.querySelector('.thoughtknot-sketch-tools .thoughtknot-walk-said').textContent,
        'Select a thing first, then draw on it.',
      );
      buttonOf(el, 'Done drawing').click();
      const p = at(placeOf('bob').x, placeOf('bob').y);
      vp.dispatch('pointerdown', mouse(5, boxOf('bob'), p));
      vp.dispatch('pointerup', mouse(5, boxOf('bob'), p));
      buttonOf(el, 'Draw').click();
      buttonOf(el, 'Ellipse').click();
      buttonOf(el, 'Draw on the selected thing').click();
      await until(() => /SKETCH ON team/.test(env.state.files.get(PATH)));
      await settled();
      assert.match(env.state.files.get(PATH), /\(d1:Shape \{x: 0, y: 0, pin: 'bob', shape: 'ellipse'\}\)/);
      assert.match(el.querySelector('.thoughtknot-sketch-tools .thoughtknot-walk-said').textContent, /^Drawn: /);
    } finally {
      env.uninstall();
    }
  });

  // proves: sketch_keyboard
  test('Next drawing selects each drawing in turn and says what it is', async () => {
    const { env, el } = await card(noteOf(TEAM, INKED));
    try {
      buttonOf(el, 'Next drawing').click();
      assert.ok(layerOf(el).querySelector('[data-sketch]').classList.contains('is-selected'));
      assert.match(
        el.querySelector('.thoughtknot-sketch-tools .thoughtknot-walk-said').textContent,
        /^Selected: .*Ann/,
      );
      assert.ok(buttonOf(el, 'Delete drawing'), 'and it can be deleted from there');
    } finally {
      env.uninstall();
    }
  });
});
