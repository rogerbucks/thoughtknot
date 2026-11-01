// Zen view (editor spec §25, controls_zen). Roger, 1 Nov 2026: a button that opens full screen with every panel hidden,
// until the button is pressed again. The built plugin, loaded against the stand-ins for the page.
// - From a card, Zen view opens full screen with every panel hidden and one button left, which closes it again.
// - In full screen, Zen view hides the panels, and the one button shows them again, staying in full screen.
// - Hidden means the bar, the chip and docks, the details and the hints. The drawing and its mini-map stay.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { load, GRAPH, show } from './host/view-notes.js';

before(() => build());

let env, el;
before(async () => {
  env = await load();
  el = (await show(env, fence(GRAPH))).el;
  await until(() => !!el.querySelector('.thoughtknot-viewport'));
});
after(() => env.uninstall());

const overlay = () => env.doc.body.querySelector('.thoughtknot-fullscreen');
const exit = () => overlay()?.querySelector('.thoughtknot-zen-exit');

// proves: controls_zen
test('from a card, Zen view opens full screen with one button left, which closes it again', () => {
  labelled(el, 'Zen view').click();
  assert.ok(overlay(), 'full screen');
  assert.ok(overlay().classList.contains('is-zen'), 'every panel hidden');
  assert.equal(overlay().querySelectorAll('.thoughtknot-zen-exit').length, 1, 'one button left');
  assert.equal(exit().getAttribute('aria-label'), 'Show the panels again');
  assert.ok(env.doc.activeElement === exit(), 'the keyboard is on it');
  exit().click();
  assert.ok(!overlay(), 'pressed again: back to the card as it was');
});

// proves: controls_zen
test('in full screen, Zen view hides the panels, and its button shows them again in full screen', () => {
  labelled(el, 'Full screen').click();
  assert.ok(overlay() && !overlay().classList.contains('is-zen'));
  labelled(overlay(), 'Zen view').click();
  assert.ok(overlay().classList.contains('is-zen'));
  exit().click();
  assert.ok(overlay(), 'still full screen');
  assert.ok(!overlay().classList.contains('is-zen'), 'the panels back');
  assert.ok(!exit(), 'the button gone with zen');
  overlay().dispatch('keydown', { key: 'Escape' });
});

// proves: controls_zen
test('in zen the bar, chip, docks, details and hints are hidden, and the mini-map stays', () => {
  const css = readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8');
  assert.match(
    css,
    /\.thoughtknot-fullscreen\.is-zen \.thoughtknot-view > :not\(\.thoughtknot-viewport, \.thoughtknot-sr\) \{\s*display: none;/,
  );
  const hidden = /\.thoughtknot-fullscreen\.is-zen\s*:is\(([^)]*)\)\s*\{\s*display: none;/.exec(css)?.[1] ?? '';
  for (const cls of ['pointer', 'space-pad', 'hint'])
    assert.match(hidden, new RegExp(`\\.thoughtknot-${cls}\\b`), `${cls} hidden`);
  assert.doesNotMatch(css, /is-zen[^{]*\.thoughtknot-mini-map/, 'the mini-map stays, so the person keeps their place');
});
