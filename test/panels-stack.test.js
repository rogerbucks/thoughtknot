// The cards over the drawing stack, never overlap, measured in a real browser (editor spec §25, panels_stack). Roger,
// 6 Nov 2026: "The side panels regularly overlap each other … and the text on screen."
// The slot list (controls-slots.test.js) only checks which card claims which corner. Here the Claude Code host's page,
// the desktop app's too, is opened over the architecture's own graph. Every panel is opened and a thing is picked. It
// runs at three sizes: a tablet's, a laptop's and a large screen's. It runs in the page and full screen, in 2D, 2.5D
// and 3D (scripts/panels-overlap.mjs). Then no two cards may overlap, and none may run past the drawing. The judging is tried
// first on measures made up here, so a pass means it looked.
//
// Chrome is the one THOUGHTKNOT_CHROME names, or the first of the usual names on the PATH. Where none is found the
// browser case skips with one line, except in CI, where a missing Chrome fails.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findChrome } from '../scripts/chrome.mjs';
import { ROOT } from './repository/repo.js';

const check = () => import('../scripts/panels-overlap.mjs');

const card = (name, left, top, width, height) => ({ name, left, top, right: left + width, bottom: top + height });
const drawing = card('drawing', 0, 0, 1200, 800);

describe('judging what a page measured', () => {
  // proves: panels_stack
  test('two cards that overlap are named, with by how much', async () => {
    const { findings } = await check();
    const cards = [card('corner (end)', 900, 8, 292, 500), card('details', 900, 300, 292, 300)];
    assert.deepEqual(findings('large', { drawing, cards }), ['large: corner (end) overlaps details by 292 by 208']);
  });

  // proves: panels_stack
  test('cards that only touch, edge on edge, do not overlap', async () => {
    const { findings } = await check();
    const cards = [card('corner (end)', 900, 8, 292, 300), card('details', 900, 308, 292, 300)];
    assert.deepEqual(findings('large', { drawing, cards }), []);
  });

  // proves: panels_stack
  test('a card that runs past the drawing is named, with by how much', async () => {
    const { findings } = await check();
    const cards = [card('corner (end)', 900, 8, 292, 1087)];
    assert.deepEqual(findings('page', { drawing, cards }), ['page: corner (end) runs 295 past the drawing']);
  });
});

describe('in a real browser, the Claude Code host', () => {
  let chrome, why;
  try {
    chrome = findChrome(process.env.THOUGHTKNOT_CHROME);
  } catch {
    why = 'no Chrome found here (set THOUGHTKNOT_CHROME): the panels are checked in CI';
    if (process.env.GITHUB_ACTIONS) throw new Error('CI must check the panels, and found no Chrome');
    console.warn(why);
  }

  // proves: panels_stack
  test(
    'every panel open and a thing picked: no two cards overlap at any size, in any space',
    { skip: why ?? false, timeout: 600_000 },
    async () => {
      const { checkPanels } = await check();
      const { launcherFor, modVault, opens } = await import('../packages/claude-code/test/editor-mod-support.js');
      const where = modVault();
      // a graph that fills the drawing, with groups, yet light enough for the run's memory: the architecture's own
      const spec = join(where.vault, 'Notes', 'architecture.md');
      const gql = readFileSync(join(ROOT, 'requirements/architecture.gql'), 'utf8');
      writeFileSync(spec, `---\nclassification: Public\n---\n# Architecture\n\n\`\`\`gql\n${gql}\`\`\`\n`);
      const { launcher } = launcherFor(where);
      await opens(launcher, spec);
      assert.deepEqual(await checkPanels(launcher.link, { chrome, thing: 'Core' }), []);
    },
  );
});
