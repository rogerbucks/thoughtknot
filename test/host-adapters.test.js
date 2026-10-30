// Every host's real adapter passes the one host contract (editor spec §43, hosts_pass_contract). Each runs as follows:
// - Obsidian's: built as the plugin builds it, run against the stand-in for Obsidian;
// - the browser page's: run in a DOM;
// - the desktop app's: the window carries the browser page's adapter unchanged, so it runs in the app's own built
//   editor page (packages/app);
// - VS Code's: its tab is the browser page too. So the page's adapter runs in the tab's page, made from the built
//   extension (packages/vscode).
// Each whole host passes the services contract too (risk ARCH-1): its settings, secrets, links, notes, drafts and
// layouts. Obsidian's is made from the built plugin, by the `obsidianHost` it exports. The browser editor's puts its page's parts and its server's
// together (page/editor-host.ts). And only a host's storage adapter writes a file, so no host keeps its own note writer.
import { test, describe, before, after } from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
import { hostContract, hostServicesContract } from '../packages/core/src/display/host-contract.ts';
import { inThreadPort, loadEngine, serveLayouts } from '../packages/core/src/index.ts';
import { browserHost } from '../packages/claude-code/page/browser-host.ts';
import { editorHost } from '../packages/claude-code/page/editor-host.ts';
import { folderStorage } from '../packages/claude-code/server/folder-storage.ts';
import { DraftShelf } from '../packages/claude-code/server/note-drafts.ts';
import { pageSettings } from '../packages/claude-code/server/page-settings.ts';
import { fakeObsidian } from '../packages/obsidian/test/host/fake-obsidian.js';
import { build as buildPlugin, load } from '../packages/obsidian/test/host/load-plugin.js';
import { builtApp, cleanUpApp } from '../packages/app/test/app-window.js';
import { buildExtension } from '../packages/vscode/esbuild.config.mjs';
import { webviewHtml } from '../packages/vscode/src/webview-html.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);

/** A row of a menu as the contract reads it, from a title and its marks. */
const row = (title, checked, warning) => ({
  title,
  ...(checked !== undefined && { checked }),
  ...(warning && { warning: true }),
});

/** Obsidian's adapter as the plugin bundles it, with the core's host module beside it, loaded against `obsidian`. */
async function obsidianAdapter(obsidian) {
  const out = await build({
    stdin: {
      contents:
        "export { installObsidianHost } from './packages/obsidian/src/display-host.ts';\n" +
        "export { displayHost } from './packages/core/src/display/host.ts';\n",
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    external: ['obsidian'],
    write: false,
    logLevel: 'silent',
  });
  const Module = require('node:module');
  const m = new Module('obsidian-adapter.js');
  const real = Module._load;
  Module._load = (req, ...rest) => (req === 'obsidian' ? obsidian : real(req, ...rest));
  try {
    m._compile(out.outputFiles[0].text, 'obsidian-adapter.js');
  } finally {
    Module._load = real;
  }
  return m.exports;
}

/** A fresh Obsidian host for one check, and its probe over the stand-in's notices and menus. */
async function makeObsidian() {
  const state = {};
  const adapter = await obsidianAdapter(fakeObsidian(state));
  adapter.installObsidianHost();
  const doc = new JSDOM('<!doctype html><body></body>').window.document;
  const last = () => state.menus[state.menus.length - 1];
  return {
    host: adapter.displayHost(),
    probe: {
      doc,
      element: () => doc.body.appendChild(doc.createElement('span')),
      notices: () => state.notices,
      lastMenu: () =>
        last()?.rows.map((r) =>
          r === 'separator' ? r : row(r.title, r.checkable ? r.checked : undefined, r.warning),
        ) ?? null,
      choose: (title) =>
        last()
          .items.find((i) => i.title === title)
          .click(),
    },
  };
}

/** A fresh browser page host for one check, in its own DOM (`html`), and its probe over the page's notices and menus. */
function makeBrowser(html = '<!doctype html><body></body>') {
  const { window } = new JSDOM(html);
  const doc = window.document;
  const win = { document: doc, setTimeout: () => 0, matchMedia: () => ({ matches: false }) };
  const menus = () => [...doc.querySelectorAll('.gn-menu')];
  return {
    host: browserHost(win),
    probe: {
      doc,
      element: () => doc.body.appendChild(doc.createElement('span')),
      notices: () => [...doc.querySelectorAll('.gn-notice')].map((n) => n.textContent),
      lastMenu: () => {
        const menu = menus().pop();
        if (!menu) return null;
        return [...menu.children].map((el) =>
          el.tagName === 'HR'
            ? 'separator'
            : row(
                el.querySelector(':scope > span:last-child').textContent,
                el.hasAttribute('aria-checked') ? el.getAttribute('aria-checked') === 'true' : undefined,
                el.classList.contains('gn-menu-warning'),
              ),
        );
      },
      choose: (title) =>
        [...menus().pop().querySelectorAll('button')]
          .find((b) => b.querySelector(':scope > span:last-child').textContent === title)
          .click(),
    },
  };
}

/** A fresh desktop app host for one check: the browser page's adapter, in the app's built editor page. */
const makeApp = async () => makeBrowser(readFileSync(join(await builtApp(), 'editor.html'), 'utf8'));

let extension;
/** A fresh VS Code host for one check: the browser page's adapter, in the tab's page made from the built extension. */
async function makeVscode() {
  extension ??= (async () => {
    const dir = mkdtempSync(join(tmpdir(), 'thoughtknot-vscode-'));
    await buildExtension(join(dir, 'dist'));
    return dir;
  })();
  const page = readFileSync(join(await extension, 'dist/webview/index.html'), 'utf8');
  const settings = { base: 'https://webview.invalid/dist/webview', note: 'Reader.md', language: 'en' };
  return makeBrowser(webviewHtml(page, settings, 'https://webview.invalid', 'n'));
}

/** The host the next check runs on: the checks ask for one synchronously, so each test makes it first. */
let made;

describe('every host’s adapter passes the one host contract', () => {
  after(cleanUpApp);
  after(async () => extension && rmSync(await extension, { recursive: true, force: true }));
  for (const [name, make] of [
    ['Obsidian', makeObsidian],
    ['the browser page', () => makeBrowser()],
    ['the desktop app', makeApp],
    ['VS Code', makeVscode],
  ])
    describe(name, () => {
      for (const check of hostContract(() => made))
        test(check.name, async () => {
          made = await make();
          await check.run();
        });
    });
});

/** A worker that lays drawings out on this thread, with the engine, as the page's worker file does in a browser. */
class InThreadWorker {
  constructor() {
    this.port = inThreadPort((scope) => serveLayouts(scope, loadEngine));
    this.port.onmessage = (e) => this.onmessage?.(e);
    this.port.onerror = (e) => this.onerror?.(e);
  }
  postMessage(request) {
    this.port.postMessage(request);
  }
  terminate() {
    this.port.terminate();
  }
}

let loaded = null;
/** The built plugin's whole host, loaded fresh against the stand-in, with its probe; the last one loaded is unloaded. */
async function wholeObsidian() {
  loaded?.uninstall();
  loaded = await load();
  const { state } = loaded;
  const { probe } = makeBrowser();
  const last = () => state.menus[state.menus.length - 1];
  return {
    host: loaded.exports.obsidianHost(loaded.plugin),
    probe: {
      ...probe,
      notices: () => state.notices,
      lastMenu: () =>
        last()?.rows.map((r) =>
          r === 'separator' ? r : row(r.title, r.checkable ? r.checked : undefined, r.warning),
        ) ?? null,
      choose: (title) =>
        last()
          .items.find((i) => i.title === title)
          .click(),
      opened: () => (state.opened ? [state.opened.link] : []),
      keepSecret: (name, secret) => loaded.app.secretStorage.setSecret(name, secret),
    },
  };
}

const folders = [];
/** The browser editor's whole host: the page's parts in a DOM, over a fresh vault folder and a drafts folder beside it. */
async function wholeEditor() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'thoughtknot-editor-host-')));
  folders.push(dir);
  const vault = join(dir, 'vault');
  mkdirSync(vault);
  const shelf = await DraftShelf.open(join(dir, 'drafts'), { real: vault, named: vault });
  const { host, probe } = makeBrowser();
  const win = {
    document: probe.doc,
    setTimeout: () => 0,
    clearTimeout: () => {},
    matchMedia: () => ({ matches: false }),
    Worker: InThreadWorker,
  };
  const settings = pageSettings(JSON.stringify({ direction: 'LR' }));
  const whole = editorHost({ win, files: folderStorage(vault), drafts: shelf, settings });
  return { host: { ...whole, display: host }, probe: { ...probe, opened: () => [] } };
}

describe('every host’s whole interface passes the services contract', () => {
  before(() => buildPlugin());
  after(() => loaded?.uninstall());
  after(() => folders.forEach((f) => rmSync(f, { recursive: true, force: true })));
  for (const [name, make, serves] of [
    ['Obsidian', wholeObsidian, {}],
    ['the browser editor', wholeEditor, { links: false }],
  ])
    describe(name, () => {
      for (const check of hostServicesContract(() => made, serves))
        test(check.name, async () => {
          made = await make();
          await check.run();
        });
    });
});

/**
 * The files in host packages that write a file. Each is a storage adapter, or writes what is not a note: an export's
 * picture, or a plug-in kept outside the vault's notes.
 */
const WRITERS = [
  'packages/claude-code/server/note-file.ts',
  'packages/obsidian/src/export/vault-write.ts',
  'packages/obsidian/src/outside/outside-plugins.ts',
  'packages/obsidian/src/storage/vault-storage.ts',
  'packages/vscode/src/vscode-disk.ts',
];

test('in a host package, only its storage adapter writes a file, so no host keeps a note writer of its own', () => {
  const write =
    /vault\.(modify|process|create|append|createBinary|modifyBinary|rename)\(|\.adapter\.(write|append)|\b(writeFile|writeFileSync|appendFile|appendFileSync|rename|renameSync)\(/;
  const shipped = execFileSync(
    'git',
    ['ls-files', 'packages/*/src/**.ts', 'packages/*/page/**.ts', 'packages/*/server/**.ts'],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  )
    .split('\n')
    .filter((f) => f && !/^packages\/(core|graph-spec)\//.test(f));
  const writers = shipped.filter((f) => write.test(readFileSync(join(ROOT, f), 'utf8')));
  assert.deepEqual(writers.sort(), WRITERS);
});
