// Checked on phones and tablets before a person tries one (editor spec §40, mobile_checked).
// - The plug-in loads and draws a graph as on Obsidian mobile. There Obsidian has no Node and no Electron, so the
//   plug-in may ask for neither, at load or while it draws.
// - The nightly builds each phone and tablet app: the Android app, and the iPhone and iPad app. It runs the phone and
//   tablet app workflow for that.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { build, load, until } from '../packages/obsidian/test/host/load-plugin.js';
import { PATH, NOTE, show } from '../packages/obsidian/test/host/card-notes.js';

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** What Obsidian mobile does not have: Node's own modules, and Electron. */
const DESKTOP_ONLY = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  'electron',
  '@electron/remote',
]);

before(() => build());

test('the plug-in says it runs on phones and tablets too', () => {
  assert.equal(JSON.parse(read('manifest.json')).isDesktopOnly, false);
});

test('on Obsidian mobile the plug-in loads and draws a graph, asking for nothing from Node or Electron', async () => {
  const Module = require('node:module'),
    real = Module._load,
    asked = [];
  // in place for the whole check, so a module asked for late, while drawing, is caught too
  Module._load = function (request, parent, ...rest) {
    const fromPlugin = parent?.filename?.endsWith('/main.js');
    if (fromPlugin && DESKTOP_ONLY.has(request)) {
      asked.push(request);
      throw new Error(`Obsidian mobile has no ${request}`);
    }
    return real.call(this, request, parent, ...rest);
  };
  let env;
  try {
    env = await load({ files: { [PATH]: NOTE }, mobile: true, width: 390 });
    const el = await show(env);
    await until(() => !!el.querySelector('svg .thoughtknot-node, svg g[data-key]'), 8000);
    assert.ok(el.querySelector('svg'), 'the graph is drawn');
  } finally {
    Module._load = real;
    env?.uninstall();
  }
  assert.deepEqual(asked, [], 'nothing from Node or Electron is asked for on a phone');
});

test('the nightly builds each phone and tablet app', () => {
  const nightly = read('.github/workflows/nightly.yml');
  const job = /\n  mobile:\n([\s\S]*?)\n\n/.exec(nightly)?.[1] ?? '';
  assert.match(job, /uses: \.\/\.github\/workflows\/mobile-app\.yml$/m);
  assert.doesNotMatch(job, /secrets/, 'no key reaches a phone build');
  const workflow = read('.github/workflows/mobile-app.yml');
  assert.match(workflow, /\n  android:\n/);
  assert.match(workflow, /\n  ios-simulator:\n/);
  assert.match(workflow, /\n  workflow_call:\n/);
});
