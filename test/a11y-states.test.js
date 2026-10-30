// States a person once checked by hand, measured in a real browser (editor spec §41, a11y_states_auto; risks UX-2 and
// UX-9). The Obsidian host's harness is opened in a headless Chrome and brought to each state with real key presses:
// - the focused box has a ring that shows against what is behind it, in light and dark (SC 2.4.7, 2.4.11);
// - Escape closes a panel and gives the focus back (SC 2.4.3);
// - nothing runs on for ever once reduced motion is asked for (SC 2.3.3);
// - every button of the sheet is 44 points at a phone's width (AX-14);
// - at twice the text size, no control covers another and no word is cut off (SC 1.4.4, 1.4.12);
// - in the test languages en-XA and ar-XB the views still reflow and keep every control (pseudo_locales_checked).
// What it judges is tried first on measures made up here. Then each check is tried on a fault planted in a real page,
// so a pass means it looked. Chrome is the one THOUGHTKNOT_CHROME names, or the first of the usual names on the PATH.
// Where none is found the browser cases skip with one line, except in CI, where a missing Chrome fails.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findChrome } from '../scripts/chrome.mjs';
import { ROOT } from './repository/repo.js';

const states = () => import('../scripts/a11y-states.mjs');

const box = { w: 200, h: 100 };
const good = { changed: 900, contrast: 8 };

describe('judging what a page measured', () => {
  // proves: a11y_states_auto
  test('a ring that is missing, too faint or the same as no focus is named', async () => {
    const { ringFindings, MIN_RING_CONTRAST } = await states();
    assert.equal(MIN_RING_CONTRAST, 3);
    assert.deepEqual(ringFindings('light', box, good, good), []);
    assert.deepEqual(ringFindings('dark', box, { changed: 0, contrast: 0 }, good), [
      'dark: the focused box has no ring of its own: 0 pixels round it change when it is off, 300 needed',
    ]);
    assert.deepEqual(ringFindings('dark', box, { changed: 900, contrast: 2.2 }, good), [
      'dark: the focus ring is 2.2 to 1 against what is behind it, under 3 to 1',
    ]);
    assert.deepEqual(ringFindings('light', box, good, { changed: 10, contrast: 8 }), [
      'light: a focused box looks the same as one without focus: 10 pixels round it change, 300 needed',
    ]);
  });

  // proves: a11y_states_auto
  test('a control over another, and words cut off, are named; a panel over the drawing and a nested control are not', async () => {
    const { crowdFindings } = await states();
    const c = (name, left, right, over = {}) => ({
      name,
      left,
      right,
      top: 0,
      bottom: 40,
      cuts: false,
      layer: 'card',
      ...over,
    });
    assert.deepEqual(crowdFindings('card', [c('button Fit', 0, 80), c('button Find', 90, 170)]), []);
    assert.deepEqual(crowdFindings('card', [c('button Fit', 0, 80), c('button Find', 60, 140)]), [
      'card: button Fit and button Find overlap by 20 by 40',
    ]);
    assert.deepEqual(crowdFindings('card', [c('button Fit', 0, 80, { cuts: true })]), [
      'card: button Fit cuts its words off',
    ]);
    assert.deepEqual(crowdFindings('card', [c('button Tree', 0, 80, { layer: 'panel' }), c('button Fit', 20, 60)]), []);
    assert.deepEqual(crowdFindings('card', [c('summary Menu', 0, 200), c('input Name', 10, 100)]), []);
  });
});

describe('in a real browser, the Obsidian host’s harness', () => {
  let chrome, why;
  try {
    chrome = findChrome(process.env.THOUGHTKNOT_CHROME);
  } catch {
    why = 'no Chrome found here (set THOUGHTKNOT_CHROME): the states are checked in CI';
    if (process.env.GITHUB_ACTIONS) throw new Error('CI must check the states, and found no Chrome');
    console.warn(why);
  }
  const options = { skip: why ?? false, timeout: 300_000 };

  let built;
  before(() => {
    built = mkdtempSync(join(tmpdir(), 'states-harness-'));
    execFileSync(process.execPath, [join(ROOT, 'packages/obsidian/harness/build.mjs'), built], { stdio: 'ignore' });
  });
  after(() => rmSync(built, { recursive: true, force: true }));

  // proves: a11y_states_auto
  test(
    'every state holds: the ring, Escape, reduced motion, the sheet, 200% text and the test languages',
    options,
    async () => {
      const { checkStates } = await states();
      assert.deepEqual(await checkStates(built, { chrome }), []);
    },
  );

  /** A style planted in the page, as a line of script. */
  const style = (css) =>
    `document.head.append(Object.assign(document.createElement('style'), { textContent: ${JSON.stringify(css)} }))`;
  const PLANTED = {
    focusRing: [style('.thoughtknot-focus-ring { display: none !important }'), /no ring of its own/],
    escapeReturns: [
      `document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setTimeout(() => document.activeElement.blur(), 0) }, true)`,
      /after Escape the focus is on BODY/,
    ],
    reducedMotion: [
      style('@keyframes spin { to { opacity: 0.5 } } body { animation: spin 1s infinite }'),
      /still runs on for ever/,
    ],
    sheetTargets: [
      style('.thoughtknot-sheet button { height: 30px !important; min-height: 0 !important }'),
      /the sheet: button .* is \d+ by 30/,
    ],
    bigText: [style('#note .thoughtknot-bar > button { margin-inline-end: -30px !important }'), /overlap by/],
    testLanguages: [
      `document.querySelector('#note').append(Object.assign(document.createElement('div'), { style: 'width:900px;height:4px' }))`,
      /at 320 CSS pixels the page is \d+ wide/,
    ],
  };
  for (const [check, [plant, expected]] of Object.entries(PLANTED))
    // proves: a11y_states_auto
    test(`the check looks: a fault planted for ${check} is found`, options, async () => {
      const { checkStates } = await states();
      const found = await checkStates(built, { chrome, checks: [check], plant });
      assert.ok(
        found.some((f) => expected.test(f)),
        found.join('\n') || 'nothing was found',
      );
    });
});
