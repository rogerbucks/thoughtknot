// proves: risk_panel
// Easier reading (risk NEURO-9): one setting spreads out the text of the bar and the panels. The line height and the
// letter and word spacing are design tokens, so the style sheet changes them in one place. The built plugin, against
// the stand-ins.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { build } from './host/load-plugin.js';
import { load } from './host/view-notes.js';
import { THEME_TOKENS } from '../../core/src/theme-tokens.ts';
import { settingsFrom, OPTIONS } from '../../core/src/settings.ts';

before(() => build());

const SHEET = readFileSync(new URL('../../../styles.css', import.meta.url), 'utf8');

/** The tokens the bar's computed style takes from the style sheet, with the body's class as given. */
function tokens(bodyClass) {
  const { window } = new JSDOM(
    `<style>${SHEET}</style><body class="${bodyClass}"><div class="thoughtknot-bar"></div>`,
    {
      virtualConsole: new VirtualConsole(),
    },
  );
  const style = window.getComputedStyle(window.document.querySelector('.thoughtknot-bar'));
  return ['--gn-line-height', '--gn-letter-spacing', '--gn-word-spacing'].map((t) => style.getPropertyValue(t));
}

describe('Easier reading', () => {
  test('line height, letter spacing and word spacing are design tokens', () => {
    for (const t of ['--gn-line-height', '--gn-letter-spacing', '--gn-word-spacing'])
      assert.equal(THEME_TOKENS[t]?.kind, 'type', t);
  });

  test('the class on the page raises each token over its usual value', () => {
    const usual = tokens('');
    const eased = tokens('thoughtknot-easier-reading');
    assert.deepEqual(usual, ['1.5', '0em', 'normal']);
    assert.deepEqual(eased, ['1.8', '0.12em', '0.16em']);
  });

  test('is a setting, off unless it is turned on', () => {
    assert.equal(settingsFrom(undefined).easierReading, 'off');
    assert.equal(settingsFrom({ easierReading: 'on' }).easierReading, 'on');
    assert.equal(settingsFrom({ easierReading: 'loud' }).easierReading, 'off');
    assert.ok(OPTIONS.some((o) => o.key === 'easierReading' && o.name === 'Easier reading'));
  });

  test('marks the page while it is on, and not while it is off', async () => {
    const on = await load({ data: { settings: { easierReading: 'on' } } });
    try {
      assert.ok(on.doc.body.classList.contains('thoughtknot-easier-reading'));
    } finally {
      on.uninstall();
    }
    const off = await load();
    try {
      assert.ok(!off.doc.body.classList.contains('thoughtknot-easier-reading'));
    } finally {
      off.uninstall();
    }
  });
});
