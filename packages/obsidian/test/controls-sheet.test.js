// The phone's control sheet (editor spec §25, controls_sheet). Roger, 1 Nov 2026: each screen size gets controls that
// suit it. On a phone they sit in one sheet at the foot of the drawing, in reach of a thumb. The built plugin, loaded
// against the stand-ins as a phone.
// - The chip and the docks are in its Controls tab. Its handle steps through three heights.
// - Choosing a thing turns it to Details, at peek; closing them turns it back. The details are not pinned on their own.
// - Off a phone there is no sheet. Its styles lay it over the foot of the drawing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { load, GRAPH, show } from './host/view-notes.js';
import { tapKey } from './host/inspector-steps.js';
import { rules, winner } from './host/cascade.js';

before(() => build());

let env, el;
before(async () => {
  env = await load({ mobile: true });
  el = (await show(env, fence(GRAPH))).el;
});
after(() => env.uninstall());

const sheet = () => el.querySelector('.thoughtknot-phone-sheet');
const handle = () => sheet().querySelector('.thoughtknot-phone-sheet-handle');
const tabs = () => sheet().querySelectorAll('.thoughtknot-phone-sheet-tab');
const panes = () => sheet().querySelectorAll('.thoughtknot-phone-sheet-pane');
const selected = () => tabs().find((t) => t.getAttribute('aria-selected') === 'true')?.textContent;

// proves: controls_sheet
test('on a phone the chip and the docks sit in the Controls tab of one sheet over the drawing', () => {
  assert.ok(sheet().parentElement.classList.contains('thoughtknot-over'), 'in the layer over the drawing');
  assert.deepEqual(
    tabs().map((t) => t.textContent),
    ['Controls', 'Details'],
  );
  assert.equal(selected(), 'Controls');
  assert.ok(tabs()[1].hidden, 'no Details tab while nothing is chosen');
  const corner = el.querySelector('.thoughtknot-corner');
  assert.ok(corner.parentElement === panes()[0], 'the corner is in the Controls tab');
  assert.ok(corner.querySelector('.thoughtknot-chip'), 'with the chip');
});

// proves: controls_sheet
test('its handle steps through three heights, peek first, and says which', () => {
  assert.ok(sheet().classList.contains('is-peek'));
  assert.match(handle().getAttribute('aria-label'), /peek/);
  handle().click();
  assert.ok(sheet().classList.contains('is-half') && !sheet().classList.contains('is-peek'));
  handle().click();
  assert.ok(sheet().classList.contains('is-full'));
  assert.match(handle().getAttribute('aria-label'), /full/);
  handle().click();
  assert.ok(sheet().classList.contains('is-peek'), 'and back to the strip');
});

// proves: controls_sheet
test('choosing a thing turns it to Details at peek, and closing them turns it back to Controls', () => {
  handle().click(); // half
  tapKey(el, 'large');
  const details = el.querySelector('.thoughtknot-details');
  assert.ok(!details.hidden);
  assert.ok(details.parentElement === panes()[1], 'the details are in the Details tab');
  assert.ok(!details.classList.contains('thoughtknot-sheet'), 'not pinned to the screen on their own');
  assert.equal(selected(), 'Details');
  assert.ok(!tabs()[1].hidden && panes()[0].hidden && !panes()[1].hidden);
  assert.ok(sheet().classList.contains('is-peek'), 'at peek, so the thing stays in sight');
  handle().click();
  tapKey(el, 'tablet');
  assert.ok(sheet().classList.contains('is-half'), 'a thing chosen next keeps the height');
  tabs()[0].click();
  assert.equal(selected(), 'Controls', 'its tabs turn it by hand');
  details
    .querySelectorAll('button')
    .find((b) => b.getAttribute('aria-label') === 'Close details')
    .click();
  assert.ok(details.hidden);
  assert.equal(selected(), 'Controls');
  assert.ok(tabs()[1].hidden);
});

// proves: controls_sheet
test('off a phone there is no sheet, and on one it lies over the foot of the drawing', async () => {
  env.uninstall();
  env = await load(); // a laptop's; uninstalled after
  const card = (await show(env, fence(GRAPH))).el;
  assert.ok(!card.querySelector('.thoughtknot-phone-sheet'));
  assert.ok(card.querySelector('.thoughtknot-corner').parentElement.classList.contains('thoughtknot-over'));
  const all = rules(readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8'), 'thoughtknot');
  const over = { tag: 'div', classes: ['thoughtknot-over'] };
  const peek = { tag: 'div', classes: ['thoughtknot-phone-sheet', 'is-peek'], states: [], ancestors: [over] };
  assert.equal(winner(all, peek, 'position').value, 'absolute');
  assert.equal(winner(all, peek, 'transform').value, 'translateY(-100%)');
  assert.match(winner(all, peek, 'height').value, /0\.18 \* var\(--thoughtknot-room/);
  const tab = { tag: 'button', classes: ['thoughtknot-phone-sheet-tab'], states: [], ancestors: [peek, over] };
  assert.equal(winner(all, tab, 'min-height').value, '44px');
});
