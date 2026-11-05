// The exploration's controls on a phone, and for anyone who cannot see colour (editor spec §71,
// explore_controls_on_screen, explore_controls_accessible). Roger, 31 Oct 2026: the controls are on screen with no menu
// to open, and a strip on a phone. The built plugin, loaded against the stand-ins as a phone.
// Requirements: explore_controls_on_screen and explore_controls_accessible.
// - On a phone, exploring puts the sidebar in the Controls tab of the sheet at the foot of the drawing.
// - It holds the shapes and dials, in reach of a thumb.
// - Every dial and shape button keeps a target of at least 24 pixels, well past that at 44.
// - Under forced colours every main branch is drawn in the text colour, the badges in the system's highlight.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build, until } from './host/load-plugin.js';
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

const css = readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8');
const withText = (root, tag, text) => root.querySelectorAll(tag).find((b) => b.textContent.includes(text));

// proves: explore_controls_on_screen
test('on a phone exploring puts the sidebar, with its shapes and dials, in the Controls tab of the sheet', async () => {
  tapKey(el, 'large');
  withText(el.querySelector('.thoughtknot-details'), 'button', 'Explore from here').click();
  await until(() => !el.querySelector('g.node[data-key="tablet"]'));
  const sidebar = el.querySelector('.thoughtknot-explore-sidebar');
  assert.ok(sidebar && !sidebar.hidden, 'the sidebar shows while exploring');
  const sheet = el.querySelector('.thoughtknot-phone-sheet'),
    panes = sheet.querySelectorAll('.thoughtknot-phone-sheet-pane');
  assert.ok(panes[0].contains(sidebar), 'in the Controls tab of the sheet at the foot of the drawing');
  assert.equal(sidebar.querySelectorAll('.thoughtknot-explore-shapes button').length, 6, 'the six shapes');
  assert.ok(withText(sidebar, 'button', 'Back') && withText(sidebar, 'button', 'Next'));
  assert.equal(sidebar.querySelectorAll('[role="spinbutton"]').length, 2, 'the depth and per-branch dials');
});

// proves: explore_controls_accessible
test('every dial, shape and badge target keeps at least 24 pixels, and a dial is a control with a name and a value', () => {
  const all = rules(css, 'thoughtknot');
  const at = (tag, classes, ancestors = []) => ({ tag, classes, states: [], ancestors });
  const dock = at('div', ['thoughtknot-dock']);
  const target = (e) => Number.parseFloat(winner(all, e, 'min-height')?.value);
  assert.ok(target(at('button', [], [dock])) >= 24, 'a button in a dock');
  assert.ok(target(at('span', ['thoughtknot-explore-dial-value'])) >= 24, 'a dial’s value');
  const sidebar = el.querySelector('.thoughtknot-explore-sidebar');
  for (const dial of sidebar.querySelectorAll('[role="spinbutton"]')) {
    assert.ok(dial.getAttribute('aria-label') || dial.getAttribute('aria-labelledby'), 'a dial has a name');
    assert.ok(dial.getAttribute('aria-valuenow'), 'and a value');
  }
});

// proves: explore_controls_accessible
test('under forced colours every main branch takes the text colour, and a badge the highlight', () => {
  const forced = css.slice(css.indexOf('@media (forced-colors: active)'));
  for (let i = 0; i < 6; i++) assert.match(forced.slice(0, 3000), new RegExp(`--gn-branch-${i}: CanvasText`));
  assert.match(forced.slice(0, 3000), /--gn-accent: Highlight/, 'the badges are filled with the accent');
  assert.match(css, /g\.edge\.thoughtknot-explore-step\[data-branch='0'\] path \{\s*stroke: var\(--gn-branch-0\)/);
  assert.match(css, /\.thoughtknot-explore-badge circle \{\s*fill: var\(--gn-accent\)/);
});
