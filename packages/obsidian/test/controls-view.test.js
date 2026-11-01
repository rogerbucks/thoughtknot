// The flat drawing's key controls (editor spec §25, controls_keys). Roger, 1 Nov 2026: the controls used most stay on
// screen, not in a menu. A 2D card lists the View menu's ladder of detail and its small-labels switch for its dock.
// - The dock floats in the corner over the drawing: less detail, more detail, and small labels hidden.
// - Each steps the ladder or turns the switch, and the menu and the dock agree.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { load, GRAPH, show } from './host/view-notes.js';
import { readFileSync } from 'node:fs';
import { rules, winner } from './host/cascade.js';

before(() => build());

let env, el;
before(async () => {
  env = await load();
  el = (await show(env, fence(GRAPH))).el;
});
after(() => env.uninstall());

const dock = () => el.querySelector('.thoughtknot-view-dock');
const keys = () => dock().querySelector('.thoughtknot-dock-body').querySelectorAll('button');
const checked = () =>
  el.querySelectorAll('.thoughtknot-detail-rung').find((b) => b.getAttribute('aria-checked') === 'true')?.textContent;

// proves: controls_keys
test('a 2D card has a View dock in the corner: less detail, more detail and small labels hidden', () => {
  assert.ok(dock().parentElement.classList.contains('thoughtknot-corner'));
  assert.ok(dock().classList.contains('has-keys'));
  const names = keys().map((b) => b.getAttribute('aria-label'));
  assert.equal(names.length, 3);
  assert.match(names[0], /^Less detail/);
  assert.match(names[1], /^More detail/);
  assert.ok(keys()[2].hasAttribute('aria-pressed'), 'the labels switch says if it is on');
  assert.ok(dock().querySelector('.thoughtknot-dock-more').hidden, 'no More with nothing under it');
});

// proves: controls_keys
test('its buttons step the ladder and turn the switch, and the menu agrees', async () => {
  const from = checked();
  const [less, more, labels] = keys();
  const down = !less.hasAttribute('disabled');
  (down ? less : more).click();
  await until(() => checked() !== from);
  assert.notEqual(checked(), from, 'the menu shows the new rung');
  const pressed = labels.getAttribute('aria-pressed');
  keys()[2].click();
  await until(() => keys()[2].getAttribute('aria-pressed') !== pressed);
  assert.notEqual(keys()[2].getAttribute('aria-pressed'), pressed);
});

// proves: controls_dock
// Roger chose the Zen-led refresh on 1 Nov 2026: the two "View" cards become one card with labelled tiles.
test('the chip and the docks make one card, each key control a tile with its name', () => {
  const chipName = el.querySelector('.thoughtknot-chip-fold').textContent;
  const dockName = dock().querySelector('.thoughtknot-dock-name').textContent;
  assert.notEqual(chipName.replace(/[▾▴]/, '').trim(), dockName, 'not two cards both called View');
  assert.equal(dockName, 'Detail');
  const words = keys().map((b) => b.querySelector('.thoughtknot-badge-text')?.textContent);
  assert.deepEqual(words.slice(0, 2), ['Less detail', 'More detail']);
  assert.ok(words[2], 'the labels switch has its name too');
  const all = rules(readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8'), 'thoughtknot');
  const over = { tag: 'div', classes: ['thoughtknot-over'] };
  const corner = { tag: 'div', classes: ['thoughtknot-corner'], states: [], ancestors: [over] };
  const inner = { tag: 'div', classes: ['thoughtknot-dock'], states: [], ancestors: [corner, over] };
  assert.match(winner(all, corner, 'border').value, /1px solid var\(--gn-border-focus\)/, 'the corner is the card');
  assert.equal(winner(all, corner, 'box-shadow').value, 'var(--gn-shadow-s)');
  assert.equal(winner(all, inner, 'border')?.value ?? 'none', 'none', 'no card inside the card');
  assert.equal(winner(all, inner, 'box-shadow')?.value ?? 'none', 'none');
});
