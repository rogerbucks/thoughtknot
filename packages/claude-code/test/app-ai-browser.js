// The phone app's window in a real Chrome, as a phone, with AI on (ES§19, app_ai_settings, app_ai_send_sheet). It is
// test/phone-shell.test.js's way of opening the app, with the AI plug-in's commands answered by the page: the device
// hosts AI, keeps keys in a map, and records each request it is handed without sending it anywhere. Chrome is the one
// THOUGHTKNOT_CHROME names, or the first of the usual names on the PATH. Where none is found the cases skip, except in
// CI, which fails.
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { findChrome, startChrome } from '../../../scripts/chrome.mjs';
import { buildApp } from '../../app/esbuild.config.mjs';

const NOTE =
  "# Map\nThe note's own words.\n```gql\n// graph: g · SOURCE\n(a:Idea {title: 'One'}),\n(b:Idea {title: 'Two'}),\n(a)-[:RELATES_TO]->(b)\n```\n";
const LINK = 'editor.html#token=app&note=Map.md';

/** AI on, with a model the person runs on their tailnet, for notes up to Public, and unlabelled notes as Public. */
export const SETUP = {
  aiUse: 'on',
  aiUnlabelled: 'Public',
  aiModels: [
    {
      name: 'Mac mini',
      purpose: 'Proposing changes',
      ceiling: 'Public',
      endpoint: 'https://mac-mini.tailnet.ts.net/v1',
      model: 'llama',
      keyName: 'Mac mini',
      reach: 'private',
    },
  ],
};

/** Whether Chrome is here, and why not when it is not. */
export function chromeHere(what) {
  try {
    return { chrome: findChrome(process.env.THOUGHTKNOT_CHROME), why: undefined };
  } catch {
    const why = `no Chrome found here (set THOUGHTKNOT_CHROME): ${what} is checked in CI`;
    if (process.env.GITHUB_ACTIONS) throw new Error(`CI must check ${what}, and found no Chrome`);
    console.warn(why);
    return { chrome: undefined, why };
  }
}

/** The app built and served, and a phone-sized Chrome on it. `stop` ends both. */
export async function phoneApp(chrome) {
  const built = mkdtempSync(join(tmpdir(), 'app-ai-'));
  await buildApp(built);
  const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' };
  const server = createServer((q, r) => {
    const file = join(built, decodeURIComponent(q.url.split(/[?#]/)[0]).replace(/\/$/, '/index.html'));
    if (!file.startsWith(built) || !existsSync(file)) return r.writeHead(404).end();
    r.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  }).listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await startChrome({ chrome, width: 393, height: 852, scale: 2 });
  const stub = `(() => {
    const notes = { 'Map.md': ${JSON.stringify(NOTE)} };
    const keys = new Map();
    window.__aiSent = [];
    localStorage.setItem('thoughtknot.ai.setup', ${JSON.stringify(JSON.stringify(SETUP))});
    window.__TAURI__ = { core: { invoke: async (c, a = {}) => {
      if (c === 'own_folder') return 'Documents';
      if (c === 'read_dir') return Object.keys(notes).map((n) => [n, false]);
      if (c === 'read_text') { if (a.path in notes) return notes[a.path]; throw 'ENOENT'; }
      if (c === 'write_text') { notes[a.path] = a.text; return; }
      if (c === 'machine_found') return [];
      if (c === 'plugin:ai|ai_here') return { host: true, onDevice: 'device-not-eligible' };
      if (c === 'plugin:ai|ai_key_has') return keys.has(a.name);
      if (c === 'plugin:ai|ai_key_get') return keys.get(a.name) ?? null;
      if (c === 'plugin:ai|ai_key_set') return void keys.set(a.name, a.key);
      if (c === 'plugin:ai|ai_key_forget') return void keys.delete(a.name);
      if (c === 'plugin:ai|ai_request') { window.__aiSent.push(a.request); return { status: 200, text: '{"data":[]}' }; }
      throw 'not in this test: ' + c;
    } } };
  })()`;
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: stub });
  await browser.send('Emulation.setDeviceMetricsOverride', {
    width: 393,
    height: 852,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await browser.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const wait = async (expression) => {
    for (let i = 0; i < 200 && !(await browser.run(expression)); i++) await new Promise((t) => setTimeout(t, 100));
  };
  return {
    browser,
    wait,
    /** Opens the note, and waits for the board and the AI group to be drawn. */
    open: async () => {
      await browser.send('Page.navigate', { url: 'about:blank' });
      await browser.send('Page.navigate', { url: `${base}/${LINK}` });
      await wait(`Boolean(document.querySelector('.thoughtknot-board') && document.querySelector('.gn-ai'))`);
    },
    tap: (tab) => browser.run(`document.querySelector('.gn-tab[data-tab=${tab}]').click()`),
    stop: async () => {
      await browser.stop();
      server.close();
      rmSync(built, { recursive: true, force: true });
    },
  };
}
