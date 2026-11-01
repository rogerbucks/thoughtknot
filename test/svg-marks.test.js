// The marks of a drawing on screen, read for the view in space, in a real browser (editor spec §53, space_bare_names).
// - A thing drawn as its name alone, as a matrix or a plan draws its rows, is read as a pale box round its name.
// - Its label is its name once, though the matrix writes it again as its column.
// - A thing drawn in a box is read as before.
//
// Chrome is the one THOUGHTKNOT_CHROME names, or the first on the PATH. Where none is found the cases skip, except in CI.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findChrome, startChrome } from '../scripts/chrome.mjs';
import { ROOT } from './repository/repo.js';

/** The page's script: reads a matrix's rows and one boxed thing as marks. */
const PAGE = `
import { marksOfSvg } from './packages/core/src/display/graph-view/svg-marks.ts';
window.readBare = () => {
  const holder = document.body.appendChild(document.createElement('div'));
  holder.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><g class="graph">
    <g class="node" data-key="ada"><text style="fill:rgb(20, 20, 20)" x="90" y="40" text-anchor="end" font-size="12">Ada</text>
      <text style="fill:rgb(20, 20, 20)" x="140" y="20" font-size="12">Ada</text></g>
    <g class="node" data-key="bob"><polygon fill="rgb(200, 240, 200)" points="200,140 280,140 280,180 200,180"/><text x="240" y="165" font-size="14">Bob</text></g>
  </g></svg>\`;
  const { marks, paints } = marksOfSvg(holder.querySelector('svg'));
  const text = holder.querySelector('[data-key=ada] text').getBBox();
  holder.remove();
  return { marks, paints: Object.fromEntries(marks.map((m) => [m.id, paints(m.style)])), text: { x: text.x, y: text.y, width: text.width, height: text.height } };
};
`;

describe('the marks of a drawing on screen, in a real browser', () => {
  let chrome, why;
  try {
    chrome = findChrome(process.env.THOUGHTKNOT_CHROME);
  } catch {
    why = 'no Chrome found here (set THOUGHTKNOT_CHROME): the marks are read in CI';
    if (process.env.GITHUB_ACTIONS) throw new Error('CI must read the marks of a drawing, and found no Chrome');
    console.warn(why);
  }
  const options = { skip: why ?? false, timeout: 120_000 };
  let browser, folder;
  before(async () => {
    if (why) return;
    const bundle = await build({
      stdin: { contents: PAGE, resolveDir: ROOT, loader: 'ts' },
      bundle: true,
      format: 'iife',
      write: false,
      logLevel: 'silent',
    });
    browser = await startChrome({ chrome, width: 500, height: 400, scale: 1 });
    folder = mkdtempSync(join(tmpdir(), 'svg-marks-'));
    writeFileSync(join(folder, 'page.js'), bundle.outputFiles[0].text);
    writeFileSync(
      join(folder, 'page.html'),
      '<!doctype html><meta charset="utf-8"><title>Marks</title><script src="page.js"></script>',
    );
    await browser.send('Page.navigate', { url: pathToFileURL(join(folder, 'page.html')).href });
    for (let i = 0; i < 50 && (await browser.run('document.readyState')) !== 'complete'; i++)
      await new Promise((r) => setTimeout(r, 100));
  });
  after(async () => {
    await browser?.stop();
    if (folder) rmSync(folder, { recursive: true, force: true });
  });

  test('a thing drawn as its name alone is a pale box round its name, named once', options, async () => {
    const { marks, paints, text } = JSON.parse(await browser.run('JSON.stringify(readBare())'));
    const byId = new Map(marks.map((m) => [m.id, m]));
    const ada = byId.get('t:ada');
    assert.ok(ada, 'a thing drawn as its name alone is read');
    assert.equal(ada.kind, 'box');
    assert.ok(ada.x < text.x && ada.y < text.y, 'its box starts before its name');
    assert.ok(
      ada.x + ada.width > text.x + text.width && ada.y + ada.height > text.y + text.height,
      'and ends after it',
    );
    assert.equal(byId.get('l:ada').text, 'Ada', 'its label is its name once');
    assert.equal(paints['t:ada'].line, 'rgb(20, 20, 20)', 'its box is drawn in its words colour');
    assert.match(paints['t:ada'].fill, /\/ 0\.12\)$/, 'and filled pale');
    const bob = byId.get('t:bob');
    assert.deepEqual([bob.x, bob.y, bob.width, bob.height], [200, 140, 80, 40], 'a boxed thing is read as before');
    assert.equal(byId.get('l:bob').text, 'Bob');
  });
});
