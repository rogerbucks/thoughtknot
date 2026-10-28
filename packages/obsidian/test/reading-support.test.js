// The Reading support view preset (editor spec §69, view_reading_support):
// - Plain sans words, wider word spacing and a line height of 1.5 across the card, and no special font.
// - Short labels in the drawing, the full words in the details, read aloud by the device's own voice.
// - An outline of the graph one key away, O, in every view.
// The built plugin, against the stand-ins.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { load, show, styles } from './host/view-notes.js';
import { tapKey } from './host/inspector-steps.js';

before(() => build());

const LONG = 'The quarterly report on the reading habits of every reader we spoke to';
const GRAPH = `// graph: reading
(report:Report {name: '${LONG}'}),
(team:Team {name: 'Team'}),
(team)-[:WROTE]->(report)`;
const READING = { data: { settings: { viewPreset: 'reading' } } };

/** The device's own voice, as a browser gives one: what it was asked to say. */
function voice(env) {
  const said = [];
  const win = env.doc.defaultView;
  win.speechSynthesis = { speaking: false, speak: (u) => said.push(u.text), cancel() {} };
  win.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  return said;
}

const boxText = (el, key) =>
  el
    .querySelector(`g.node[data-key="${key}"]`)
    .querySelectorAll('text')
    .map((t) => t.textContent)
    .join(' ');

describe('the Reading support preset', () => {
  // proves: view_reading_support
  test('cuts a long label short in the drawing, and the details give the full words, read aloud', async () => {
    const env = await load(READING);
    const said = voice(env);
    try {
      assert.ok(env.doc.body.classList.contains('thoughtknot-reading'), 'the page is marked for reading');
      const { el } = await show(env, fence(GRAPH));
      const drawn = boxText(el, 'report');
      assert.ok(drawn.includes('…'), `cut short: ${drawn}`);
      assert.ok(!drawn.includes('spoke to'), 'not every word');
      assert.equal(boxText(el, 'team'), 'TEAM Team', 'a short label stays as it is');
      tapKey(el, 'report');
      const details = el.querySelector('.thoughtknot-details');
      assert.equal(details.querySelector('.thoughtknot-details-head strong').textContent, LONG, 'the full words');
      const aloud = details.querySelector('.thoughtknot-read-aloud');
      assert.ok(aloud, 'a button to read them aloud');
      assert.equal(aloud.getAttribute('aria-label'), 'Read aloud');
      aloud.click();
      assert.equal(said.length, 1);
      assert.ok(said[0].startsWith(`${LONG}, Report.`), said[0]);
    } finally {
      env.uninstall();
    }
  });

  // proves: view_reading_support
  test('the default preset keeps every word and offers no reading aloud', async () => {
    const env = await load();
    voice(env);
    try {
      assert.ok(!env.doc.body.classList.contains('thoughtknot-reading'));
      const { el } = await show(env, fence(GRAPH));
      assert.ok(!boxText(el, 'report').includes('…'), 'every word');
      tapKey(el, 'report');
      assert.equal(el.querySelector('.thoughtknot-read-aloud'), null);
    } finally {
      env.uninstall();
    }
  });

  // proves: view_reading_support
  test('spaces plain sans words wider, with a line height of 1.5, and no special font', () => {
    const css = styles.replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = /body\.thoughtknot-reading \.thoughtknot-view \{([^}]*)\}/.exec(css)?.[1] ?? '';
    assert.match(rule, /font-family: var\(--gn-font-ui\);/);
    assert.match(rule, /word-spacing: 0\.25em;/);
    assert.match(rule, /line-height: 1\.5;/);
    assert.doesNotMatch(css, /dyslexi/i, 'no font made for dyslexia');
  });
});

describe('the outline', () => {
  // proves: view_reading_support
  test('is one key away, O, on every drawing: the graph in sentences beside it, with the full words', async () => {
    const env = await load(READING);
    try {
      const { el } = await show(env, fence(GRAPH));
      const vp = el.querySelector('.thoughtknot-viewport');
      const outline = el.querySelector('.thoughtknot-outline');
      assert.ok(outline && !outline.classList.contains('is-shown'), 'hidden until asked for');
      assert.equal(outline.getAttribute('aria-label'), 'Outline of reading');
      assert.ok(vp.dispatch('keydown', { key: 'o' }).defaultPrevented);
      assert.ok(outline.classList.contains('is-shown'));
      const lines = outline.querySelectorAll('li').map((li) => li.textContent);
      assert.ok(
        lines.some((l) => l.includes(LONG)),
        'the full words',
      );
      assert.ok(
        lines.some((l) => /Team wrote/.test(l)),
        lines.join(' | '),
      );
      vp.dispatch('keydown', { key: 'o' });
      assert.ok(!outline.classList.contains('is-shown'), 'O again hides it');
      const css = styles.replace(/\/\*[\s\S]*?\*\//g, '');
      assert.match(css, /\.thoughtknot-outline\.is-shown \{[^}]*position: static;[^}]*clip-path: none;/);
    } finally {
      env.uninstall();
    }
  });
});
