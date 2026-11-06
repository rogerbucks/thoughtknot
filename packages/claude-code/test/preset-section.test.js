// The view preset panel on the browser editor's page (editor spec ES§69, view_presets_portable, view_presets_scoped).
// VS Code's tab, the desktop app and the web run this page. The panel is the core's, the one Obsidian's settings page
// uses. Here the vault's own file is where a preset is kept. Each case runs the page as built, in a DOM, against the
// real server and a real vault. It reads the file the server wrote.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { until } from '../../obsidian/test/host/load-plugin.js';
import { vaultPresetFile } from '../../core/src/vault-preset.ts';
import { presetFile, starterOf } from '../../core/src/view-presets.ts';
import { cleanUp } from './editor-page-support.js';
import { livePage } from './editor-page-live.js';

after(cleanUp);

const PLACE = 'ThoughtKnot view preset.json';
const NOTE = [
  '# Trip',
  '```gql',
  '// graph: trip',
  "(a:Place {name: 'Paris'}), (b:Place {name: 'Rome'}), (a)-[:NEAR]->(b)",
  '```',
  '',
].join('\n');
const panel = (page) => page.doc.querySelector('.gn-presets');
const rowText = (page, name) =>
  [...(panel(page)?.querySelectorAll('li') ?? [])].find((li) => li.textContent.includes(name))?.textContent ?? '';
const press = (page, name) =>
  [...panel(page).querySelectorAll('button')].find((b) => b.textContent.trim() === name)?.click();

describe('the view preset panel on the browser editor’s page', () => {
  // proves: view_presets_scoped, view_presets_portable
  test('says whose preset is in use, and follows the vault’s file already there', async () => {
    const page = await livePage(NOTE, { files: { [PLACE]: vaultPresetFile('focus') } });
    try {
      await until(() => panel(page), 8000);
      await until(() => /Focus support, chosen by this vault/.test(rowText(page, 'View preset in use')), 8000);
      assert.ok(panel(page).querySelector('select'), 'the starters are offered to pick from');
    } finally {
      await page.stop();
    }
  });

  // proves: view_presets_scoped, view_presets_portable, view_presets_predictable
  test('shows what a pick changes first, writes the vault’s file only when used, and removes it on asking', async () => {
    const page = await livePage(NOTE);
    try {
      await until(() => panel(page), 8000);
      assert.match(rowText(page, 'View preset in use'), /chosen by your settings|built-in/);
      const select = panel(page).querySelector('select');
      select.value = 'calm';
      select.dispatchEvent(new page.window.Event('change', { bubbles: true }));
      await until(() => /Before you use Calm/.test(panel(page).textContent), 8000);
      assert.equal(existsSync(join(page.vault, PLACE)), false, 'a pick writes nothing');
      press(page, 'Use this preset');
      await until(() => existsSync(join(page.vault, PLACE)), 8000);
      assert.equal(readFileSync(join(page.vault, PLACE), 'utf8'), vaultPresetFile('calm'));
      await until(() => /Calm and predictable, chosen by this vault/.test(rowText(page, 'View preset in use')), 8000);
      await until(() => page.doc.querySelector('.thoughtknot-view')?.classList.contains('thoughtknot-still'), 8000);
      press(page, 'Stop using a vault preset');
      await until(() => !existsSync(join(page.vault, PLACE)), 8000);
      await until(() => !/chosen by this vault/.test(rowText(page, 'View preset in use')), 8000);
      await until(() => !page.doc.querySelector('.thoughtknot-view')?.classList.contains('thoughtknot-still'), 8000);
    } finally {
      await page.stop();
    }
  });

  // proves: view_presets_portable
  test('hands the preset in use over as one file to keep', async () => {
    const page = await livePage(NOTE, { files: { [PLACE]: vaultPresetFile('detail') } });
    try {
      await until(() => panel(page), 8000);
      const kept = [];
      page.window.Blob = class {
        constructor(parts) {
          kept.push(parts.join(''));
        }
      };
      page.window.HTMLAnchorElement.prototype.click = function () {
        kept.push(this.download);
      };
      await until(() => /chosen by this vault/.test(rowText(page, 'View preset in use')), 8000);
      press(page, 'Export the preset in use');
      await until(() => kept.length === 2, 8000);
      assert.match(kept[0], /thoughtknot-view-preset@1/);
      assert.equal(kept[1], 'View preset.json');
    } finally {
      await page.stop();
    }
  });

  // proves: view_presets_portable
  test('takes a preset file brought in, and shows what it would change before anything is kept', async () => {
    const page = await livePage(NOTE);
    try {
      await until(() => panel(page), 8000);
      const input = panel(page).querySelector('input[type=file]');
      assert.ok(input, 'a preset file can be brought in');
      const file = { text: () => Promise.resolve(presetFile(starterOf('focus'))) };
      Object.defineProperty(input, 'files', { value: [file] });
      input.dispatchEvent(new page.window.Event('change', { bubbles: true }));
      await until(() => /Before you use Focus support/.test(panel(page).textContent), 8000);
      assert.equal(existsSync(join(page.vault, PLACE)), false, 'bringing a file in writes nothing');
    } finally {
      await page.stop();
    }
  });
});
