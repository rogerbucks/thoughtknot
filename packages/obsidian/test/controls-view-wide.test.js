// The View panel on a large screen (editor spec §25, controls_view_panel_wide). Roger chose this design on 2 Nov 2026.
// On a large screen the View panel is open from the start, docked at the end. Elsewhere it waits for the View button.
// - At 1600 pixels wide or more a card opens with its View panel shown, and the View button says so.
// - Shut from the bar, it stays shut on the next card drawn in this session.
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
test('on a large screen the View panel is open from the start, and the View button says so', async () => {
  const { el } = await show(env, fence(GRAPH));
  await settle();
  const panel = el.querySelector('.thoughtknot-view-menu');
  assert.ok(!panel.hidden, 'open from the start');
  assert.ok(panel.parentElement.classList.contains('thoughtknot-corner-end'), 'docked at the end');
  assert.equal(labelled(el, 'View').getAttribute('aria-expanded'), 'true');
  labelled(el, 'View').click();
  assert.ok(panel.hidden, 'the View button shuts it');
});

// proves: controls_view_panel_wide
test('shut from the bar, it stays shut on the next card drawn in this session', async () => {
  const { el } = await show(env, fence(GRAPH));
  await settle();
  assert.ok(el.querySelector('.thoughtknot-view-menu').hidden);
  assert.equal(labelled(el, 'View').getAttribute('aria-expanded'), 'false');
});
