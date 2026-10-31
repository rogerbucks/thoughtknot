// The explore sidebar (editor spec §71). Roger, 31 Oct 2026: the controls sit on screen as dials, in a sidebar, with a
// quick search to start the tree from any thing. The built plugin, loaded against the stand-ins for the page.
// Requirements: explore_controls_on_screen and explore_controls_accessible.
// - The bar's search offers Explore from beside each thing found; the sidebar shows while exploring, and only then.
// - Its search makes a thing found the centre; its shapes say which is in use.
// - Each dial works by its buttons, the arrow keys, Home, End and the wheel, and says its value.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { load, GRAPH, show } from './host/view-notes.js';

before(() => build());

const ISLAND = `${GRAPH},\n(island:Reason {title: 'Left on its own'})`;
const thing = (el, key) => el.querySelector(`g.node[data-key="${key}"]`);
const said = (el) => el.querySelector('.thoughtknot-untangle')?.textContent ?? '';
const withText = (el, tag, text) => el.querySelectorAll(tag).find((b) => b.textContent.includes(text));
const typeIn = (find, text) => {
  const input = find.querySelector('input');
  input.value = text;
  input.dispatch('input');
};

let env, el;
before(async () => {
  env = await load();
  el = (await show(env, fence(ISLAND))).el;
});
after(() => env.uninstall());
const sidebar = () => el.querySelector('.thoughtknot-explore-sidebar');
const dial = (name) =>
  sidebar()
    .querySelectorAll('.thoughtknot-explore-dial')
    .find((d) => d.textContent.includes(name));
const value = (name) => dial(name).querySelector('[role="spinbutton"]');

// proves: explore_controls_on_screen
test('the quick search starts a mind map from any thing found, and the sidebar shows while exploring', async () => {
  assert.ok(sidebar().hidden, 'no sidebar while the whole graph is shown');
  el.querySelectorAll('button')
    .find((b) => b.getAttribute('aria-label')?.startsWith('Find a thing'))
    .click();
  const bar = el.querySelector('.thoughtknot-find');
  typeIn(bar, 'Tablet');
  const explore = bar.querySelector('.thoughtknot-find-explore');
  assert.equal(explore.getAttribute('aria-label'), 'Explore from Tablet');
  explore.click();
  await until(() => !thing(el, 'large'));
  assert.match(said(el), /Exploring from Tablet/);
  assert.ok(!sidebar().hidden);
  assert.ok(bar.hidden, 'the search row closes, so it covers nothing');
  // the sidebar's own search makes another thing the centre
  typeIn(sidebar().querySelector('.thoughtknot-explore-find'), 'Large');
  withText(sidebar(), '.thoughtknot-find-results button', 'Large reader').click();
  await until(() => /Exploring from Large reader/.test(said(el)));
  await until(() => !thing(el, 'tablet') && !!thing(el, 'large'));
  assert.match(said(el), /3 things shown/, 'explored afresh from a thing not shown');
});

// proves: explore_controls_on_screen
test('the shape in use is pressed, and pressing another lays the map out in it', async () => {
  const pressed = () =>
    sidebar()
      .querySelectorAll('.thoughtknot-explore-shapes button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .map((b) => b.textContent);
  assert.deepEqual(pressed(), ['balanced mind map']);
  withText(sidebar(), 'button', 'rings').click();
  assert.deepEqual(pressed(), ['rings']);
  const back = withText(sidebar(), 'button', 'Back');
  assert.ok(!back.disabled);
  back.click();
  assert.deepEqual(pressed(), ['balanced mind map'], 'Back goes back a step');
});

// proves: explore_controls_accessible
test('each dial works by its buttons, the keys and the wheel, and says its value', async () => {
  const steps = value('Steps out');
  assert.equal(steps.getAttribute('aria-valuenow'), '1');
  assert.equal(steps.getAttribute('tabindex'), '0');
  steps.dispatch('keydown', { key: 'ArrowUp' });
  assert.equal(steps.getAttribute('aria-valuenow'), '2');
  await until(() => !!thing(el, 'tablet'));
  steps.dispatch('keydown', { key: 'Home' });
  assert.equal(steps.getAttribute('aria-valuenow'), '1');
  await until(() => !thing(el, 'tablet'));
  assert.ok(dial('Steps out').querySelector('button').disabled, 'no fewer than one step');
  const branch = value('Per branch');
  assert.equal(branch.getAttribute('aria-valuenow'), '12');
  withText(dial('Per branch'), 'button', '+').click();
  assert.equal(branch.getAttribute('aria-valuenow'), '14');
  dial('Per branch').dispatch('wheel', { deltaY: 100 });
  assert.equal(branch.getAttribute('aria-valuenow'), '12');
  branch.dispatch('keydown', { key: 'End' });
  assert.equal(branch.getAttribute('aria-valuenow'), '40');
  assert.equal(branch.getAttribute('aria-valuemax'), '40');
  withText(sidebar(), 'button', 'Show the whole graph').click();
  await until(() => !!thing(el, 'island'));
  assert.ok(sidebar().hidden);
});
