// Pictures of the phone app's screens, for a person to look at (ES§40, phone_shell). It builds the app's window.
// It opens it in a real Chrome as an iPhone of each size. It saves a picture of the start page and of each view.
// Usage: node scripts/phone-shots.mjs OUT_FOLDER [NOTE.md]. The notes are one made up here, or the file given.
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

/** Takes the pictures into `out`; returns the files written. */
export async function shoot(out, { note, chrome } = {}) {
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
  const browser = await startChrome({ chrome: findChrome(chrome), width: 393, height: 852, scale: 2 });
  const files = [];
  try {
    await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: stub(notes) });
    await browser.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    const wait = async (ready) => {
      for (let i = 0; i < 200 && !(await browser.run(ready)); i++) await new Promise((t) => setTimeout(t, 100));
      await new Promise((t) => setTimeout(t, 1200));
    };
    const save = async (name) => {
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      const file = join(out, `${name}.png`);
      writeFileSync(file, Buffer.from(data, 'base64'));
      files.push(file);
    };
    for (const [phone, width, height] of PHONES) {
      await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
      await browser.send('Page.navigate', { url: 'about:blank' });
      await browser.send('Page.navigate', { url: `${base}/index.html` });
      await wait(`document.querySelectorAll('#gn-app li a').length > 0`);
      await save(`${phone}-1-start`);
      await browser.send('Page.navigate', { url: 'about:blank' });
      await browser.send('Page.navigate', { url: `${base}/editor.html#token=app&note=Project%20map.md` });
      await wait(`Boolean(document.querySelector('.thoughtknot-board')) && Boolean(document.querySelector('.gn-tab'))`);
      let n = 2;
      for (const tab of ['board', 'graph', 'note', 'more']) {
        await browser.run(`document.querySelector('.gn-tab[data-tab=${tab}]').click()`);
        await new Promise((t) => setTimeout(t, 1500));
        await save(`${phone}-${n++}-${tab}`);
      }
    }
  } finally {
    await browser.stop();
    server.close();
    rmSync(built, { recursive: true, force: true });
  }
  return files;
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  const [out, noteFile] = process.argv.slice(2);
  if (!out) throw new Error('usage: node scripts/phone-shots.mjs OUT_FOLDER [NOTE.md]');
  const files = await shoot(resolve(out), { note: noteFile ? readFileSync(noteFile, 'utf8') : undefined });
  console.log(files.join('\n'));
}
