// Pictures of the phone app's screens, for a person to look at (ES§40, phone_shell and phone_webkit_shots). It builds
// the app's window and opens it as an iPhone of each size. It saves a picture of the start page and of each view.
// The browser is Chrome, or WebKit through Playwright: WebKit is the engine an iPhone draws every page with.
// Usage: node scripts/phone-shots.mjs OUT_FOLDER [NOTE.md] [--webkit]. The notes are made up here, or the file given.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { findChrome, startChrome } from './chrome.mjs';
import { buildApp } from '../packages/app/esbuild.config.mjs';

/** The phones pictured: name, width and height in points. */
export const PHONES = [
  ['se', 375, 667],
  ['15', 393, 852],
  ['pro-max', 430, 932],
];

/** The browsers that can take the pictures. */
export const ENGINES = ['chrome', 'webkit'];

const made = (n) => {
  const things = Array.from({ length: n }, (_, i) => `(n${i}:Idea {title: 'Thing ${i}'})`);
  const links = Array.from({ length: n - 1 }, (_, i) => `(n${i + 1})-[:RELATES_TO]->(n${Math.floor(i / 2)})`);
  return `# Project map\nA small graph.\n\`\`\`gql\n// graph: proj · SOURCE\n${[...things, ...links].join(',\n')}\n\`\`\`\n`;
};

/** The page's own stand-in for the app's Rust calls, over `notes`. */
const stub = (notes) => `(() => {
  const notes = ${JSON.stringify(notes)};
  window.__TAURI__ = { core: { invoke: async (c, a = {}) => {
    if (c === 'own_folder') return 'Documents';
    if (c === 'read_dir') return Object.keys(notes).map((n) => [n, false]);
    if (c === 'read_text') { if (a.path in notes) return notes[a.path]; throw 'ENOENT'; }
    if (c === 'write_text') { notes[a.path] = a.text; return; }
    if (c === 'machine_found') return [];
    throw 'not in these pictures: ' + c;
  } } };
})()`;

/** Chrome over its own protocol, a touch phone by its device settings. */
async function chromePhone(script, chrome) {
  const browser = await startChrome({ chrome: findChrome(chrome), width: 393, height: 852, scale: 2 });
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: script });
  await browser.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  return {
    size: (width, height) =>
      browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true }),
    go: async (url) => {
      await browser.send('Page.navigate', { url: 'about:blank' });
      await browser.send('Page.navigate', { url });
    },
    run: (js) => browser.run(js),
    png: async () => Buffer.from((await browser.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
    stop: () => browser.stop(),
  };
}

/** WebKit through Playwright, a touch phone by a fresh context for each size. */
async function webkitPhone(script) {
  const { webkit } = await import('playwright-core');
  const browser = await webkit.launch();
  let context, page;
  return {
    size: async (width, height) => {
      await context?.close();
      const phone = { viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
      context = await browser.newContext(phone);
      await context.addInitScript(script);
      page = await context.newPage();
    },
    go: (url) => page.goto(url),
    run: (js) => page.evaluate(js),
    png: () => page.screenshot(),
    stop: () => browser.close(),
  };
}

/** Takes the pictures into `out`; returns the files written. */
export async function shoot(out, { note, chrome, engine = 'chrome' } = {}) {
  if (!ENGINES.includes(engine)) throw new Error(`no such browser: ${engine}`);
  mkdirSync(out, { recursive: true });
  const notes = { 'Project map.md': note ?? made(40), 'Second note.md': '# Second\nA note with no graph.\n' };
  const built = mkdtempSync(join(tmpdir(), 'phone-shots-'));
  await buildApp(built);
  const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' };
  const server = createServer((q, r) => {
    const file = resolve(built, `.${decodeURIComponent(q.url.split(/[?#]/)[0]).replace(/\/$/, '/index.html')}`);
    if (!file.startsWith(built) || !existsSync(file)) return r.writeHead(404).end();
    r.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  }).listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  const files = [];
  let phone;
  try {
    phone = engine === 'webkit' ? await webkitPhone(stub(notes)) : await chromePhone(stub(notes), chrome);
    // a page that never shows what is waited for fails here, by name: a picture of the wrong screen is no picture
    const wait = async (ready, what) => {
      let shown = false;
      for (let i = 0; i < 200 && !(shown = Boolean(await phone.run(ready))); i++)
        await new Promise((t) => setTimeout(t, 100));
      if (!shown) throw new Error(`phone shots, ${engine}: ${what} never showed`);
      await new Promise((t) => setTimeout(t, 1200));
    };
    const save = async (name) => {
      const file = join(out, `${name}.png`);
      writeFileSync(file, await phone.png());
      files.push(file);
    };
    for (const [name, width, height] of PHONES) {
      await phone.size(width, height);
      await phone.go(`${base}/index.html`);
      await wait(`document.querySelectorAll('#gn-app li a').length > 0`, 'the list of notes');
      await save(`${name}-1-start`);
      await phone.go(`${base}/editor.html#token=app&note=Project%20map.md`);
      const shell = `Boolean(document.querySelector('.thoughtknot-board')) && Boolean(document.querySelector('.gn-tab'))`;
      await wait(shell, 'the board in the phone shell');
      let n = 2;
      for (const tab of ['board', 'graph', 'note', 'more']) {
        await phone.run(`document.querySelector('.gn-tab[data-tab=${tab}]').click()`);
        await new Promise((t) => setTimeout(t, 1500));
        await save(`${name}-${n++}-${tab}`);
      }
    }
  } finally {
    await phone?.stop();
    server.close();
    rmSync(built, { recursive: true, force: true });
  }
  return files;
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  const args = process.argv.slice(2);
  const engine = args.includes('--webkit') ? 'webkit' : 'chrome';
  const [out, noteFile] = args.filter((a) => !a.startsWith('--'));
  if (!out) throw new Error('usage: node scripts/phone-shots.mjs OUT_FOLDER [NOTE.md] [--webkit]');
  const note = noteFile ? readFileSync(noteFile, 'utf8') : undefined;
  console.log((await shoot(resolve(out), { note, engine })).join('\n'));
}
