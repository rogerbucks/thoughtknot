// Exploring a graph mind-map style from one thing, in a card (editor spec §71). Roger, 31 Oct 2026: the controls sit on
// screen, with no menu to open. The built plugin, loaded against the stand-ins for the page.
// Requirements: explore_from_here and explore_badges.
// - Explore from here in a thing's details shows it with its direct links alone, and says so in the banner.
// - Each thing shown with neighbours waiting has a badge; pressed, it opens that branch and selects nothing.
// - The banner's Show the whole graph ends the exploration.
// - An open branch always has a − that folds it, with + more beside it while some wait.
// - Each sits at the branch's outer end, as in a classic mind map (Roger, 1 Nov 2026).
// - Each step along a branch is a curve with no arrowhead, in its main branch's colour; ended, the lines are as drawn.
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
const sidebar = () => el.querySelector('.thoughtknot-explore-sidebar');

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
test('the banner offers the whole graph again, and the sidebar the rest', async () => {
  assert.ok(withText(sidebar(), 'button', 'balanced mind map'), 'the sidebar holds the shapes');
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

const HUB = [
  '// graph: hub',
  "(hub:Idea {name: 'Hub'}),",
  ...['w', 'e', 'n', 's'].map((k) => `(${k}:Idea {name: '${k}'}), (hub)-[:LINKS]->(${k}),`),
  ...Array.from({ length: 8 }, (_, i) => `(l${i}:Idea {name: 'l${i}'}), (w)-[:LINKS]->(l${i}),`),
  '(e)-[:LINKS]->(l0)',
].join('\n');
const xsOf = (g) =>
  (g.querySelector('path, polygon')?.getAttribute('d') ?? g.querySelector('polygon')?.getAttribute('points') ?? '')
    .match(/-?\d+(?:\.\d+)?/g)
    .map(Number)
    .filter((_v, i) => i % 2 === 0);

// proves: explore_badges
test('an open branch always folds with its −, + more waits beside it, and each sits at the outer end', async () => {
  const card = (await show(env, fence(HUB))).el;
  tap(card, thing(card, 'hub'));
  withText(card.querySelector('.thoughtknot-details'), 'button', 'Explore from here').click();
  await until(() => !!thing(card, 'w') && !thing(card, 'l0'));
  const per = card
    .querySelector('.thoughtknot-explore-sidebar')
    .querySelectorAll('.thoughtknot-explore-dial')
    .find((d) => /Per branch/.test(d.textContent));
  per.querySelector('[role="spinbutton"]').dispatch('keydown', { key: 'Home' });
  const of = (key, fold) =>
    card.querySelector(`.thoughtknot-explore-badge[data-explore="${key}"][data-fold="${fold}"]`);
  await until(() => !!of('w', 'more'));
  of('w', 'more').click();
  await until(() => !!thing(card, 'l0') && !!of('w', 'close'));
  assert.equal(of('w', 'more').querySelector('text').textContent, '+2', 'six shown, two still waiting');
  assert.equal(of('w', 'close').querySelector('text').textContent, '−', 'and it folds all the same');
  for (const fold of ['close', 'more']) {
    const cx = Number(of('w', fold).querySelector('circle').getAttribute('cx')),
      xs = xsOf(thing(card, 'w'));
    const outer = Math.abs(cx - Math.min(...xs)) < Math.abs(cx - Math.max(...xs)) ? 'left' : 'right';
    const left = Math.max(...xs) < Math.min(...xsOf(thing(card, 'hub')));
    assert.equal(outer, left ? 'left' : 'right', `the ${fold} badge sits at the outer end`);
  }
  const steps = () => card.querySelectorAll('g.edge.thoughtknot-explore-step');
  assert.equal(steps().length, 10, 'four main branches and six things on the first');
  assert.ok(
    steps().every(
      (g) => !g.querySelector('polygon') && /^M[-\d.]+,[-\d.]+ C/.test(g.querySelector('path').getAttribute('d')),
    ),
    'each a curve with no arrowhead',
  );
  assert.deepEqual([...new Set(steps().map((g) => g.getAttribute('data-branch')))].sort(), ['0', '1', '2', '3']);
  const onW = steps().filter((g) => g.getAttribute('data-branch') === steps()[0].getAttribute('data-branch'));
  assert.ok(onW.length > 1, 'a main branch and what is reached through it share a colour');
  of('w', 'close').click();
  await until(() => !thing(card, 'l0'));
  assert.ok(!of('w', 'close'), 'folded, it offers only +');
  assert.equal(of('w', 'more').querySelector('text').textContent, '+8');
  withText(card.querySelector('.thoughtknot-untangle'), 'button', 'Show the whole graph').click();
  await until(() => !steps().length);
  assert.ok(
    card.querySelectorAll('g.edge').some((g) => g.querySelector('polygon')),
    'the whole graph has its arrowheads again',
  );
});
