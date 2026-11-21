// Checked on phones and tablets before a person tries one (editor spec §40, mobile_checked).
// - The plug-in loads and draws a graph as on Obsidian mobile. There Obsidian has no Node and no Electron, so the
//   plug-in may ask for neither, at load or while it draws.
// - It does so in a real browser too, as a phone. The plug-in is bundled for a browser, which has no Node to lean on.
//   It runs in a headless Chrome 390 by 844 and touched, with Obsidian saying it is mobile (the harness, ?mobile).
//   The page throws nothing, draws the graph and does not scroll sideways.
// - The nightly builds each phone and tablet app: the Android app, and the iPhone and iPad app. It runs the phone and
//   tablet app workflow for that, which checks the iPhone app is the iPad's too.
// Left for a person: the plug-in on real Obsidian, on an iPhone and on an Android phone (see the requirement).
// Chrome is the one THOUGHTKNOT_CHROME names, or the first of the usual names on the PATH. Where none is found the
// browser case skips with one line, except in CI, where a missing Chrome fails.
import { test, before, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findChrome, startChrome } from '../scripts/chrome.mjs';
import { serve } from '../scripts/wiki-screens.mjs';
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
  // the iPhone app is the iPad's too: its two device families are checked once it is built
  const ios = /\n  ios-simulator:\n([\s\S]*?)\n\n/.exec(workflow)?.[1] ?? '';
  assert.match(ios, /cargo tauri ios build[\s\S]*Print :UIDeviceFamily[\s\S]*' \*1'[\s\S]*' \*2'/);
});

describe('as a phone on Obsidian mobile, in a real browser', () => {
  let chrome, why;
  try {
    chrome = findChrome(process.env.THOUGHTKNOT_CHROME);
  } catch {
    why = 'no Chrome found here (set THOUGHTKNOT_CHROME): the plug-in as a phone is checked in CI';
    if (process.env.GITHUB_ACTIONS) throw new Error('CI must check the plug-in as a phone, and found no Chrome');
    console.warn(why);
  }
  const options = { skip: why ?? false, timeout: 120_000 };
  let built, server, browser;
  before(async () => {
    if (why) return;
    built = mkdtempSync(join(tmpdir(), 'mobile-checked-'));
    execFileSync(
      process.execPath,
      [new URL('../packages/obsidian/harness/build.mjs', import.meta.url).pathname, built],
      {
        stdio: 'ignore',
      },
    );
    server = await serve(built);
  });
  after(async () => {
    await browser?.stop();
    server?.close();
    if (built) rmSync(built, { recursive: true, force: true });
  });

  test('the plug-in loads, says it is on Obsidian mobile, and draws the graph at a phone’s size', options, async () => {
    browser = await startChrome({ chrome, width: 390, height: 844, scale: 3 });
    const thrown = [];
    browser.on('Runtime.exceptionThrown', (e) =>
      thrown.push(e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text),
    );
    await browser.send('Runtime.enable');
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await browser.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await browser.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/index.html?mobile` });
    const drawn = `document.body?.dataset.ready === 'yes' && document.querySelectorAll('#note svg g[data-key], #note svg .thoughtknot-node').length > 0`;
    for (let i = 0; i < 300 && !thrown.length && !(await browser.run(drawn)); i++)
      await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(thrown, [], 'the page throws nothing on a phone');
    assert.equal(await browser.run(drawn), true, 'the graph is drawn');
    const seen = await browser.run(`({
      platform: document.body.dataset.platform,
      phone: matchMedia('(max-width: 599px) and (pointer: coarse)').matches,
      width: innerWidth,
      scrolls: document.documentElement.scrollWidth > innerWidth,
    })`);
    assert.deepEqual(seen, { platform: 'mobile', phone: true, width: 390, scrolls: false });
  });
});
