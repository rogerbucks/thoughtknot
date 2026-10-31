// Exploring a graph mind-map style from one thing, in a card (editor spec §71). Roger, 31 Oct 2026: the controls sit on
// screen, with no menu to open. The built plugin, loaded against the stand-ins for the page.
// Requirements: explore_from_here and explore_badges.
// - Explore from here in a thing's details shows it with its direct links alone, and says so in the banner.
// - Each thing shown with neighbours waiting has a badge; pressed, it opens that branch and selects nothing.
// - The banner's Show the whole graph ends the exploration.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { load, GRAPH, show } from './host/view-notes.js';

before(() => build());

const ISLAND = `${GRAPH},\n(island:Reason {title: 'Left on its own'})`;
const thing = (el, key) => el.querySelector(`g.node[data-key="${key}"]`);
const badge = (el, key) => el.querySelector(`.thoughtknot-explore-badge[data-explore="${key}"]`);
const tap = (el, g) => {
  const vp = el.querySelector('.thoughtknot-viewport');
  const init = { target: g, pointerId: 3, pointerType: 'touch', clientX: 20, clientY: 20, button: 0 };
  vp.dispatch('pointerdown', init);
  vp.dispatch('pointerup', { ...init, clientX: 21 });
};
const said = (el) => el.querySelector('.thoughtknot-untangle')?.textContent ?? '';
const withText = (el, tag, text) => el.querySelectorAll(tag).find((b) => b.textContent.includes(text));

let env, el;
before(async () => {
  env = await load();
  el = (await show(env, fence(ISLAND))).el;
  tap(el, thing(el, 'large'));
});
after(() => env.uninstall());
const details = () => el.querySelector('.thoughtknot-details');

// proves: explore_from_here, explore_badges
test('Explore from here shows the thing with its direct links, and a badge opens a branch', async () => {
  withText(details(), 'button', 'Explore from here').click();
  await until(() => !thing(el, 'tablet') && !thing(el, 'island'));
  assert.match(said(el), /Exploring from Large reader: 3 things shown/);
  for (const key of ['large', 'q', 'eyes']) assert.ok(thing(el, key), `${key} is shown`);
  // the question and the reason each have the tablet waiting behind them
  await until(() => !!badge(el, 'q'));
  assert.equal(badge(el, 'q').getAttribute('role'), 'button');
  assert.equal(badge(el, 'q').getAttribute('aria-label'), 'Show 1 more linked to Which device?');
  assert.equal(badge(el, 'q').querySelector('text').textContent, '+1');
  assert.ok(!badge(el, 'large'), 'the centre has nothing waiting');
  badge(el, 'q').click();
  await until(() => !!thing(el, 'tablet'));
  assert.match(said(el), /4 things shown/);
  assert.match(details().textContent, /Large reader/, 'pressing a badge selects nothing else');
  await until(() => badge(el, 'q')?.querySelector('text').textContent === '−');
  assert.equal(badge(el, 'q').getAttribute('aria-label'), 'Close the branch from Which device?');
  assert.ok(!badge(el, 'eyes'), 'the tablet is shown, so nothing waits behind the reason');
});

// proves: explore_from_here
test('the banner offers a step out, the shape, and the whole graph again', async () => {
  assert.ok(withText(el.querySelector('.thoughtknot-untangle'), 'button', 'Shape: balanced mind map'));
  withText(el.querySelector('.thoughtknot-untangle'), 'button', 'Show the whole graph').click();
  await until(() => !!thing(el, 'island'));
  assert.ok(!badge(el, 'q'), 'no badge is left behind');
  assert.doesNotMatch(said(el), /Exploring/);
});

// proves: explore_from_here
test('Explore from here is a toggle, and Show only ends the exploration', async () => {
  tap(el, thing(el, 'large'));
  withText(details(), 'button', 'Explore from here').click();
  await until(() => !thing(el, 'island'));
  withText(details(), 'button', 'Explore from here').click();
  await until(() => !!thing(el, 'island'));
  assert.doesNotMatch(said(el), /Exploring/, 'pressed again for the centre, the whole graph is back');
  withText(details(), 'button', 'Explore from here').click();
  await until(() => /Exploring/.test(said(el)));
  withText(details(), 'button', 'Show only this and its neighbours').click();
  await until(() => !/Exploring/.test(said(el)));
  assert.match(said(el), /neighbours|within/i);
  await until(() => !badge(el, 'q'));
  withText(el.querySelector('.thoughtknot-untangle'), 'button', 'Show the whole graph').click();
  await until(() => !!thing(el, 'island'));
});
