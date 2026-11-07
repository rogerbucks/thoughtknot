// The View panel on a large screen (editor spec §25, controls_view_panel_wide). It opened by itself on a screen 1600
// pixels wide or more from 2 Nov 2026. Roger, 6 Nov 2026: "The side panels should be minimised by default." Now it
// starts shut on every screen, a large one too. The bar's View button opens it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { load, GRAPH, show } from './host/view-notes.js';

before(() => build());

let env;
before(async () => {
  env = await load();
  env.doc.defaultView.matchMedia = (q) => ({ media: q, matches: q === '(min-width: 1600px)' });
});
after(() => env.uninstall());

const settle = () => new Promise((r) => setTimeout(r, 0));

// proves: controls_view_panel_wide
test('on a large screen the View panel starts shut, and the View button says so', async () => {
  const { el } = await show(env, fence(GRAPH));
  await settle();
  const panel = el.querySelector('.thoughtknot-view-menu');
  assert.ok(panel.hidden, 'shut from the start');
  assert.equal(labelled(el, 'View').getAttribute('aria-expanded'), 'false');
});

// proves: controls_view_panel_wide
test('the View button opens it whole, docked at the end', async () => {
  const { el } = await show(env, fence(GRAPH));
  await settle();
  labelled(el, 'View').click();
  const panel = el.querySelector('.thoughtknot-view-menu');
  assert.ok(!panel.hidden, 'opened');
  assert.ok(!panel.classList.contains('is-folded'), 'whole, not folded');
  assert.ok(panel.parentElement.classList.contains('thoughtknot-corner-end'), 'docked at the end');
  assert.equal(labelled(el, 'View').getAttribute('aria-expanded'), 'true');
});
