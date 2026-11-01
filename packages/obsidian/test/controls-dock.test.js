// The control dock (editor spec §25, controls_dock). Roger, 1 Nov 2026: a view's key controls stay on screen, over the
// drawing and never shrinking it, with an expander for the rest. The built plugin, loaded against the stand-ins.
// - The explore dock floats in the layer over the drawing, its key controls in its body, the rest under More.
// - Its button and the [ key fold it to a tab and open it again; the fold is kept for the session.
// - Folded, only its head shows (styles.css).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { load, GRAPH, show } from './host/view-notes.js';
import { rules, winner } from './host/cascade.js';

before(() => build());

let env, el;
before(async () => {
  env = await load();
  el = (await show(env, fence(GRAPH))).el;
});
after(() => env.uninstall());

const dock = () => el.querySelector('.thoughtknot-dock');
const foldButton = () => dock().querySelector('.thoughtknot-dock-fold');
const named = (root, text) => root.querySelectorAll('button').find((b) => b.textContent === text);

/** Starts exploring from the first thing the bar's search finds for `text`. */
async function explore(text) {
  el.querySelectorAll('button')
    .find((b) => b.getAttribute('aria-label')?.startsWith('Find a thing'))
    .click();
  const bar = el.querySelector('.thoughtknot-find'),
    input = bar.querySelector('input');
  input.value = text;
  input.dispatch('input');
  bar.querySelector('.thoughtknot-find-explore').click();
  await until(() => !dock().hidden);
}

// proves: controls_dock
test('the explore dock floats over the drawing, its key controls shown and the rest under More', async () => {
  assert.ok(dock().hidden, 'no dock while nothing is explored');
  await explore('Tablet');
  assert.ok(dock().parentElement.classList.contains('thoughtknot-over'), 'in the layer over the drawing');
  const body = dock().querySelector('.thoughtknot-dock-body'),
    more = dock().querySelector('.thoughtknot-dock-more');
  assert.ok(named(body, 'Back') && named(body, 'Next'), 'Back and Next are key controls');
  assert.equal(body.querySelectorAll('.thoughtknot-explore-dial').length, 2, 'both dials are key controls');
  assert.ok(named(more, 'Show the whole graph'), 'the whole graph again is under More');
  assert.ok(!named(body, 'Show the whole graph'), 'and not among the key controls');
  assert.equal(more.querySelector('summary').textContent, 'More');
});

// proves: controls_dock
test('its button and the [ key fold it to a tab and open it again', () => {
  assert.equal(foldButton().getAttribute('aria-expanded'), 'true');
  assert.equal(foldButton().getAttribute('aria-label'), 'Fold Explore away');
  foldButton().click();
  assert.ok(dock().classList.contains('is-folded'));
  assert.equal(foldButton().getAttribute('aria-expanded'), 'false');
  assert.equal(foldButton().getAttribute('aria-label'), 'Open Explore');
  const card = el.querySelector('.thoughtknot-view');
  card.dispatch('keydown', { key: '[' });
  assert.ok(!dock().classList.contains('is-folded'), 'the [ key opens it');
  card.dispatch('keydown', { key: '[' });
  assert.ok(dock().classList.contains('is-folded'), 'and folds it');
});

// proves: controls_dock
test('the fold is kept for the session: a card drawn again opens its dock folded', async () => {
  const again = (await show(env, fence(GRAPH))).el;
  el = again;
  await explore('Tablet');
  assert.ok(dock().classList.contains('is-folded'));
  foldButton().click();
  assert.ok(!dock().classList.contains('is-folded'));
});

// proves: controls_dock
test('folded, only its head shows, so the drawing is whole again', () => {
  const all = rules(readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8'), 'thoughtknot');
  const over = { tag: 'div', classes: ['thoughtknot-over'] };
  const folded = { tag: 'div', classes: ['thoughtknot-dock', 'is-folded'], states: [], ancestors: [over] };
  const body = { tag: 'div', classes: ['thoughtknot-dock-body'], states: [], ancestors: [folded, over] };
  assert.equal(winner(all, folded, 'position').value, 'absolute');
  assert.equal(winner(all, body, 'display').value, 'none');
});
