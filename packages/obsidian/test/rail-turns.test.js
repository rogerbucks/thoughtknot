// The turn knob in the side rail (ES§53, rail_turn_knob). Roger, 13 Nov 2026: "I don't understand in 3D view how to
// change the viewing angle".
// - It shows only while the drawing is seen from an angle, and its tooltip says every way to turn and tilt.
// - Dragging it turns and tilts the view; a press opens its pad, whose buttons turn and tilt it too.
// - Focused, the arrows turn and tilt it. Escape closes the pad.
// - The first time ever, the pad opens by itself; after that, only when pressed.
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDocument, installGlobals } from './host/fake-dom.js';

let uninstall, turns, rail, kept;
before(async () => {
  uninstall = installGlobals(fakeDocument());
  const { installHost } = await import('../../core/src/display/host.ts');
  installHost({ icon() {}, isPhone: () => false, notice() {}, menu() {} });
  turns = await import('../../core/src/display/graph-view/rail-turns.ts');
  rail = await import('../../core/src/display/graph-view/type-rail.ts');
});
after(() => uninstall());
beforeEach(() => {
  kept = new Map([['thoughtknot-turn-hint', 'seen']]); // seen before, unless a test says not
  document.defaultView.localStorage = {
    getItem: (k) => kept.get(k) ?? null,
    setItem: (k, v) => kept.set(k, String(v)),
  };
});

/** A rail on the page with its four ways and the knob, its turns kept in `asked`; in the view in space with `inSpace`. */
function knobbed(inSpace = false) {
  const root = document.body.createDiv();
  const { rail: r, ways } = rail.renderRail(root, () => {});
  const asked = [];
  const { shown } = turns.railTurns(r, ways, { turn: (dx, dy) => asked.push([dx, dy]), inSpace: () => inSpace });
  const knob = ways.querySelector('.thoughtknot-rail-turn');
  const pad = r.querySelector('.thoughtknot-turn-pad');
  return { root, knob, pad, shown, asked };
}

describe('the knob', () => {
  // proves: rail_turn_knob
  test('shows only while the drawing is seen from an angle, and says every way to turn on hover', () => {
    const { knob, shown } = knobbed();
    assert.equal(knob.hidden, true, 'flat: no knob');
    shown(true);
    assert.equal(knob.hidden, false, 'from an angle: in sight under the four ways');
    const title = knob.getAttribute('title');
    for (const w of ['two fingers', 'right-drag', 'Shift + arrows', 'drag this button'])
      assert.ok(title.includes(w), `${w} in: ${title}`);
    shown(false);
    assert.equal(knob.hidden, true, 'flat again: gone');
  });

  // proves: rail_turn_knob
  test('in the view in space it says the plain drag and arrows that turn there', () => {
    const { knob, shown } = knobbed(true);
    shown(true);
    const title = knob.getAttribute('title');
    assert.ok(title.includes('Mouse: drag'), title);
    assert.ok(title.includes('Keys: arrows'), title);
    assert.ok(!title.includes('Shift'), title);
  });

  // proves: rail_turn_knob
  test('a drag on it turns and tilts as it goes, and opens no pad', () => {
    const { knob, pad, shown, asked } = knobbed();
    shown(true);
    knob.dispatch('pointerdown', { pointerId: 1, clientX: 10, clientY: 10 });
    knob.dispatch('pointermove', { pointerId: 1, clientX: 11, clientY: 10 });
    assert.deepEqual(asked, [], 'a tremble is not a drag');
    knob.dispatch('pointermove', { pointerId: 1, clientX: 30, clientY: 5 });
    knob.dispatch('pointermove', { pointerId: 1, clientX: 40, clientY: 15 });
    knob.dispatch('pointerup', { pointerId: 1 });
    knob.click();
    assert.deepEqual(asked, [
      [20, -5],
      [10, 10],
    ]);
    assert.equal(pad.hidden, true, 'a drag is not a press');
  });

  // proves: rail_turn_knob
  test('focused, the arrows turn and tilt it, and go no further', () => {
    const { knob, shown, asked } = knobbed();
    shown(true);
    const ev = knob.dispatch('keydown', { key: 'ArrowLeft' });
    knob.dispatch('keydown', { key: 'ArrowDown' });
    knob.dispatch('keydown', { key: 'ArrowUp', metaKey: true });
    const step = turns.TURN_STEP_PX;
    assert.deepEqual(asked, [
      [-step, 0],
      [0, step],
    ]);
    assert.ok(ev.defaultPrevented && ev.stopped, 'the arrow walks to no thing');
  });
});

describe('the pad', () => {
  // proves: rail_turn_knob
  test('a press opens it: four buttons turn and tilt, and it says how; Escape and Got it close it', () => {
    const { knob, pad, shown, asked } = knobbed();
    shown(true);
    assert.equal(pad.hidden, true, 'seen before: it waits to be pressed');
    knob.click();
    assert.equal(pad.hidden, false);
    assert.equal(knob.getAttribute('aria-expanded'), 'true');
    const buttons = pad.querySelectorAll('.thoughtknot-turn-row button');
    assert.deepEqual(
      buttons.map((b) => b.getAttribute('aria-label')),
      ['Turn left', 'Turn right', 'Tilt up', 'Tilt down'],
    );
    for (const b of buttons) b.click();
    assert.equal(asked.length, 4);
    assert.equal(pad.querySelectorAll('.thoughtknot-turn-how li').length, 4, 'the ways to turn, line by line');
    knob.dispatch('keydown', { key: 'Escape' });
    assert.equal(pad.hidden, true, 'Escape closes it');
    knob.click();
    pad.querySelector('.thoughtknot-turn-done').click();
    assert.equal(pad.hidden, true, 'Got it closes it');
    assert.equal(knob.getAttribute('aria-expanded'), 'false');
  });

  // proves: rail_turn_knob
  test('the first time ever it opens by itself, once', () => {
    kept.clear();
    const first = knobbed();
    first.shown(true);
    assert.equal(first.pad.hidden, false, 'the first time: it says how');
    first.shown(true);
    assert.equal(first.pad.hidden, false, 'shown again while in sight: it stays as it is');
    first.shown(false);
    assert.equal(first.pad.hidden, true, 'flat: it goes with the knob');
    const next = knobbed();
    next.shown(true);
    assert.equal(next.pad.hidden, true, 'after that: only when pressed');
  });
});
