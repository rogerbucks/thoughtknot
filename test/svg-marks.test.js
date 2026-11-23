// The marks of a drawing on screen, read for the view in space, in a real browser (editor spec §53, space_bare_names).
// - A thing drawn as its name alone, as a matrix or a plan draws its rows, is read as a pale box round its name.
// - Its label is its name once, though the matrix writes it again as its column.
// - A thing drawn in a box is read as before.
// - A thing a query's highlight marks (ES§75, ai_query_highlight) is read where it was, with its badge before its name.
//   Its line is its ring's colour, as the stylesheet paints it. So the 3D view's painters show the same marks.
// - Merged queries (ES§75, ai_query_merge): the legend names each part's badge in the colour its ring is painted.
//
// Chrome is the one THOUGHTKNOT_CHROME names, or the first on the PATH. Where none is found the cases skip, except in CI.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findChrome, startChrome } from '../scripts/chrome.mjs';
import { ROOT } from './repository/repo.js';

/** The page's script: reads a matrix's rows and one boxed thing as marks. */
const PAGE = `
import { marksOfSvg } from './packages/core/src/display/graph-view/svg-marks.ts';
import { DrawingMarks } from './packages/core/src/display/graph-view/focus-marks.ts';
import { QUERY_MARKS } from './packages/core/src/filter.ts';
import { markedBy } from './packages/core/src/query-marks.ts';
import { queryLegendIn } from './packages/core/src/display/graph-view/untangle-query-legend.ts';
window.readHighlight = (css) => {
  const holder = document.body.appendChild(document.createElement('div'));
  holder.setAttribute('style', '--color-orange: rgb(236, 117, 0); --text-normal: rgb(34, 34, 34)');
  holder.innerHTML = \`<style>\${css}</style><svg class="thoughtknot-svg" xmlns="http://www.w3.org/2000/svg" width="400" height="200"><g class="graph">
    <g class="node" data-key="bob"><polygon fill="rgb(200, 240, 200)" stroke="rgb(9, 9, 9)" points="200,140 280,140 280,180 200,180"/><text x="240" y="165" font-size="14">Bob</text></g>
    <g class="node" data-key="cy"><polygon fill="rgb(200, 240, 200)" stroke="rgb(9, 9, 9)" points="20,140 80,140 80,180 20,180"/><text x="50" y="165" font-size="14">Cy</text></g>
  </g></svg>\`;
  const svg = holder.querySelector('svg');
  const read = () => {
    const { marks, paints } = marksOfSvg(svg);
    return { marks, paints: Object.fromEntries(marks.map((m) => [m.id, paints(m.style)])) };
  };
  const plain = read();
  const none = { things: new Set(), edges: new Set() };
  new DrawingMarks(svg).all({ kept: null, hidden: none, hot: null, marked: markedBy(['bob'], QUERY_MARKS[1]) });
  const lit = read();
  holder.remove();
  return { plain, lit };
};
/** Marks three things with two parts' marks, one each and both, and draws their legend: gives what each shows. */
window.readLegend = (css) => {
  const holder = document.body.appendChild(document.createElement('div'));
  holder.setAttribute('style', '--color-blue: rgb(8, 109, 221); --color-orange: rgb(236, 117, 0); --text-normal: rgb(34, 34, 34)');
  const node = (key, x) => \`<g class="node" data-key="\${key}"><polygon fill="rgb(200, 240, 200)" stroke="rgb(9, 9, 9)" points="\${x},20 \${x + 60},20 \${x + 60},60 \${x},60"/><text x="\${x + 30}" y="45">\${key}</text></g>\`;
  holder.innerHTML = \`<style>\${css}</style><svg class="thoughtknot-svg" xmlns="http://www.w3.org/2000/svg" width="400" height="100"><g class="graph">\${node('a', 10)}\${node('b', 110)}\${node('c', 210)}</g></svg>\`;
  const [one, two] = QUERY_MARKS;
  const marked = new Map([['a', [one]], ['b', [two]], ['c', [one, two]]]);
  const none = { things: new Set(), edges: new Set() };
  new DrawingMarks(holder.querySelector('svg')).all({ kept: null, hidden: none, hot: null, marked });
  queryLegendIn(holder, [{ id: 'p1', mark: one, said: 'late tasks' }, { id: 'p2', mark: two, said: 'dear tasks' }]);
  // a colour as the page paints it, so a blend and its result compare alike
  const resolve = (colour) => {
    const probe = holder.appendChild(document.createElement('i'));
    probe.style.color = colour;
    const out = getComputedStyle(probe).color;
    probe.remove();
    return out;
  };
  const things = Object.fromEntries(['a', 'b', 'c'].map((key) => {
    const g = holder.querySelector(\`[data-key=\${key}]\`);
    const ring = getComputedStyle(g.querySelector('polygon')).stroke;
    return [key, { badge: g.getAttribute('data-query-badge'), ring, label: resolve(getComputedStyle(g).getPropertyValue('--thoughtknot-query-label')) }];
  }));
  const legend = [...holder.querySelectorAll('.thoughtknot-query-legend li')].map((li) => {
    const badge = li.querySelector('.thoughtknot-query-legend-badge');
    const look = getComputedStyle(badge);
    const box = badge.getBoundingClientRect();
    return { badge: badge.textContent, said: li.textContent.slice(badge.textContent.length), ring: look.borderTopColor, label: look.color, named: badge.getAttribute('aria-label'), seen: box.width > 0 && box.height > 0 };
  });
  holder.remove();
  return { things, legend };
};
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
window.readTiles = () => {
  const holder = document.body.appendChild(document.createElement('div'));
  holder.style.background = 'rgb(255, 255, 255)';
  holder.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><g class="graph">
    <polygon fill="none" stroke="rgb(9, 9, 9)" points="0,0 400,0 400,200 0,200"/>
    <polygon class="thoughtknot-tile" fill="rgb(40, 80, 160)" fill-opacity="0.4" stroke="none" points="10,10 50,10 50,50 10,50"/>
    <polygon class="thoughtknot-tile" fill="rgb(40, 80, 160)" fill-opacity="1" stroke="none" points="50,10 90,10 90,50 50,50"/>
  </g></svg>\`;
  const { marks, paints } = marksOfSvg(holder.querySelector('svg'));
  holder.remove();
  return { marks, paints: Object.fromEntries(marks.map((m) => [m.id, paints(m.style)])) };
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

  // proves: ai_query_highlight
  test(
    "ai_query_highlight: the 3D view reads a highlight's badge and colour, each thing where it was",
    options,
    async () => {
      // the stylesheet's own rules for a highlight, so the colour read is the one the card shows
      const css = readFileSync(join(ROOT, 'styles.css'), 'utf8')
        .match(/[^}]*thoughtknot-query[^{]*\{[^}]*\}/g)
        .join('\n');
      const { plain, lit } = JSON.parse(await browser.run(`JSON.stringify(readHighlight(${JSON.stringify(css)}))`));
      const at = (r, id) => r.marks.find((m) => m.id === id);
      assert.equal(at(lit, 'l:bob').text, '★ Bob', 'the badge before its name');
      assert.equal(at(lit, 'l:cy').text, 'Cy', 'a thing not found is as it was');
      assert.equal(plain.paints['t:bob'].line, 'rgb(9, 9, 9)');
      assert.notEqual(lit.paints['t:bob'].line, 'rgb(9, 9, 9)', 'its outline is read in the colour');
      assert.equal(lit.paints['t:cy'].line, 'rgb(9, 9, 9)');
      for (const id of ['t:bob', 't:cy']) {
        const [a, b] = [at(plain, id), at(lit, id)];
        assert.deepEqual([b.x, b.y, b.width, b.height], [a.x, a.y, a.width, a.height], `${id} where it was`);
      }
    },
  );

  // proves: ai_query_merge
  test("ai_query_merge: the legend names each part's badge in the colour its ring is painted", options, async () => {
    const css = readFileSync(join(ROOT, 'styles.css'), 'utf8')
      .match(/[^}]*thoughtknot-query[^{]*\{[^}]*\}/g)
      .join('\n');
    const { things, legend } = JSON.parse(await browser.run(`JSON.stringify(readLegend(${JSON.stringify(css)}))`));
    assert.deepEqual(
      legend.map((l) => [l.badge, l.said]),
      [
        ['⚑', 'late tasks'],
        ['★', 'dear tasks'],
      ],
      'a line for each part, its badge and what it is called',
    );
    assert.ok(
      legend.every((l) => l.seen),
      'each badge is drawn',
    );
    for (const [l, key] of [
      [legend[0], 'a'],
      [legend[1], 'b'],
    ]) {
      assert.equal(things[key].badge, l.badge, `the badge drawn on ${key} is the one its legend line shows`);
      assert.equal(l.ring, things[key].ring, `in the colour ${key}'s ring is painted`);
      assert.equal(l.label, things[key].label, 'its badge in the colour of the drawn badge');
    }
    assert.notEqual(legend[0].ring, legend[1].ring, 'each part its own colour');
    assert.equal(things.c.badge, '⚑★', 'a thing both find has both badges');
    assert.equal(legend[1].named, 'Star mark, Orange', 'the mark said in words too');
  });

  // proves: space_density_tiles
  test('a shaded square of the drawing, as a density view draws, is a box of its own shade', options, async () => {
    const { marks, paints } = JSON.parse(await browser.run('JSON.stringify(readTiles())'));
    const tiles = marks.filter((m) => m.kind === 'box');
    assert.equal(tiles.length, 2, 'each square is read, and the frame round the drawing is not');
    assert.deepEqual(
      tiles.map((m) => [m.x, m.y, m.width, m.height]),
      [
        [10, 10, 40, 40],
        [50, 10, 40, 40],
      ],
    );
    assert.ok(
      tiles.every((m) => m.of === undefined),
      'a square is no thing',
    );
    const [pale, full] = tiles.map((m) => paints[m.id].fill);
    assert.equal(pale, 'rgb(169, 185, 217)', 'a paler square is its colour mixed with the page, solid');
    assert.equal(full, 'rgb(40, 80, 160)', 'the most crowded is its full colour');
  });
});
