// The View panel (editor spec §25, controls_view_panel). Roger, 2 Nov 2026: the View menu should be an easy to use
// control panel in the main view area, with more choices visible.
// - The bar's View button opens it whole, docked in the end corner over the drawing, not in the bar's panel layer.
// - Its head names it, moves it, docks it at either side and minimises it, as every dock's head does.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { load, GRAPH, show } from './host/view-notes.js';

before(() => build());

let env, el;
before(async () => {
  env = await load();
  el = (await show(env, fence(GRAPH))).el;
});
after(() => env.uninstall());

const panel = () => el.querySelector('.thoughtknot-view-menu');
const inPanel = (start) =>
  panel()
    .querySelectorAll('button')
    .find((b) => b.getAttribute('aria-label')?.startsWith(start));

// proves: controls_view_panel
test('the View button opens the View panel whole, docked in the end corner over the drawing', () => {
  assert.ok(panel().hidden, 'shut until asked');
  labelled(el, 'View').click();
  assert.ok(!panel().hidden);
  assert.ok(panel().classList.contains('thoughtknot-dock'), 'a dock, as every panel over the drawing is');
  const corner = panel().parentElement;
  assert.ok(corner.classList.contains('thoughtknot-corner-end'), 'docked in the end corner');
  assert.ok(corner.parentElement.classList.contains('thoughtknot-over'), 'in the layer over the drawing');
  assert.ok(!panel().closest('.thoughtknot-over-panels'), 'not among the bar’s panels');
  assert.ok(!panel().classList.contains('is-folded'), 'opened whole');
});

// proves: controls_view_panel
test('its head names it, docks it at either side and minimises it', () => {
  const head = panel().querySelector('.thoughtknot-dock-head');
  assert.equal(head.querySelector('.thoughtknot-dock-name').textContent, 'View');
  assert.ok(inPanel('Move View'), 'a grip to move it');
  inPanel('Dock View at the left').click();
  assert.ok(panel().parentElement.classList.contains('thoughtknot-corner'));
  assert.ok(!panel().parentElement.classList.contains('thoughtknot-corner-end'), 'docked at the start');
  inPanel('Fold View away').click();
  assert.ok(panel().classList.contains('is-folded'), 'minimised to its head');
  labelled(el, 'View').click(); // shut
  labelled(el, 'View').click(); // and open again
  assert.ok(!panel().classList.contains('is-folded'), 'the View button opens it whole again');
  inPanel('Dock View at the right').click();
  assert.ok(panel().parentElement.classList.contains('thoughtknot-corner-end'));
});
