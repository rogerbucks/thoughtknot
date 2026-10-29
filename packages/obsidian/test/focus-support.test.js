// The Focus support view preset (editor spec §69, view_focus_support):
// - The selected thing and its neighbours two links away stay sharp; the rest is blurred, never hidden.
// - A trail of recent picks in the drawing, to go back along, kept when the details close.
// A graph's own preset, written in its style graph, wins over the settings' (view_presets_scoped).
// The built plugin, against the stand-ins.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { load, show, styles, GRAPH } from './host/view-notes.js';
import { tapKey } from './host/inspector-steps.js';

before(() => build());

const FOCUS = { data: { settings: { viewPreset: 'focus', focusDepth: 'two', ownLayout: 'off' } } };
const card = (el) => el.querySelector('.thoughtknot-view');
/** The trail's buttons in the details, by their names. */
const trail = (el) => el.querySelectorAll('.thoughtknot-trail button').map((b) => b.getAttribute('aria-label'));
const close = (el) =>
  el
    .querySelector('.thoughtknot-details')
    .querySelectorAll('button')
    .find((b) => b.getAttribute('aria-label') === 'Close details')
    .click();

describe('the Focus support preset', () => {
  // proves: view_focus_support
  test('blurs what focus fades rather than hiding it, and keeps two links round the pick sharp', async () => {
    const env = await load(FOCUS);
    try {
      const { el } = await show(env, fence(GRAPH));
      assert.ok(card(el).classList.contains('thoughtknot-blur-rest'), 'the card blurs the rest');
      tapKey(el, 'tablet');
      const node = (k) => el.querySelector(`g.node[data-key="${k}"]`);
      // Tablet answers the question, which Large reader answers too: two links away, so kept
      assert.ok(!node('large').classList.contains('thoughtknot-hidden'), 'nothing is hidden');
      assert.ok(node('large').classList.contains('thoughtknot-kept'), 'two links away stays sharp');
      const css = styles.replace(/\/\*[\s\S]*?\*\//g, '');
      assert.match(css, /\.thoughtknot-blur-rest \.thoughtknot-svg g\.thoughtknot-dim \{\s*filter: blur\(1\.5px\);/);
    } finally {
      env.uninstall();
    }
  });

  // proves: view_focus_support
  test('keeps a trail of the picks in the drawing to go back along, even when the details close', async () => {
    const env = await load(FOCUS);
    try {
      const { el } = await show(env, fence(GRAPH));
      tapKey(el, 'q');
      tapKey(el, 'tablet');
      assert.deepEqual(trail(el), ['Back to Which device?']);
      close(el);
      tapKey(el, 'eyes');
      assert.deepEqual(trail(el), ['Back to Tablet']);
      el.querySelectorAll('.thoughtknot-trail button')[0].click();
      assert.match(el.querySelector('.thoughtknot-details-head strong').textContent, /Tablet/);
      assert.deepEqual(trail(el), ['Back to Which device?', 'Forward to Easy on the eyes']);
    } finally {
      env.uninstall();
    }
  });

  // proves: view_focus_support
  test('the default preset starts the trail again at each pick in the drawing, and blurs nothing', async () => {
    const env = await load({ data: { settings: { ownLayout: 'off' } } });
    try {
      const { el } = await show(env, fence(GRAPH));
      assert.ok(!card(el).classList.contains('thoughtknot-blur-rest'));
      tapKey(el, 'q');
      tapKey(el, 'tablet');
      assert.deepEqual(trail(el), []);
    } finally {
      env.uninstall();
    }
  });
});

describe('a graph’s own preset', () => {
  const own = (preset) =>
    `${fence(GRAPH)}\n\n${fence(`// graph: reader_style · STYLE reader\n(p1:Preset {preset: '${preset}'})`)}`;

  // proves: view_presets_scoped
  test('written in its style graph, it wins over the one the settings pick, for that card alone', async () => {
    const env = await load({ data: { settings: { viewPreset: 'reading', ownLayout: 'off' } } });
    try {
      const { el } = await show(env, own('focus'));
      assert.ok(card(el).classList.contains('thoughtknot-blur-rest'), 'the graph’s Focus support blurs the rest');
      assert.ok(card(el).classList.contains('thoughtknot-still'), 'and holds its moving links still');
      tapKey(el, 'q');
      tapKey(el, 'tablet');
      assert.deepEqual(trail(el), ['Back to Which device?'], 'it keeps the trail');
      const plain = await show(env, fence(GRAPH));
      assert.ok(!card(plain.el).classList.contains('thoughtknot-blur-rest'), 'a graph with none follows the settings');
      assert.ok(env.doc.body.classList.contains('thoughtknot-reading'), 'whose Reading support marks the page');
      const reading = await show(env, own('reading'));
      assert.ok(card(reading.el).classList.contains('thoughtknot-reading'), 'its words plain as Reading support asks');
    } finally {
      env.uninstall();
    }
  });
});
