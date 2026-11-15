// Whiteboard files in and out on the browser editor's page (editor spec ES§45, board_exchange). VS Code's tab, the
// desktop app and the phone app run this page. A file brought in is copied into the note as a board. The boards of
// the note are handed over as files. The page runs as built, in a DOM, against the real server.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { until } from '../../obsidian/test/host/load-plugin.js';
import { cleanUp } from './editor-page-support.js';
import { livePage } from './editor-page-live.js';

after(cleanUp);

const NOTE = [
  '# Ideas',
  '```gql',
  '// graph: ideas · BOARD',
  "(a:Sticky {x: 10, y: 20, text: 'Go by train'}),",
  '(v:View {x: 0, y: 400})',
  '```',
  '',
].join('\n');
const CANVAS = JSON.stringify({
  nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'From Obsidian' }],
  edges: [],
});

const bar = (page) => page.doc.querySelector('.gn-boards .gn-board-exchange');
const status = (page) => bar(page).querySelector('[role=status]').textContent;
function bring(page, name, text) {
  const input = bar(page).querySelector('input[type=file]');
  Object.defineProperty(input, 'files', { value: [{ name, text: () => Promise.resolve(text) }], configurable: true });
  input.dispatchEvent(new page.window.Event('change', { bubbles: true }));
}
/** What the page hands over from now on: the text of each file, then its name. */
function kept(page) {
  const got = [];
  page.window.Blob = class {
    constructor(parts) {
      got.push(typeof parts[0] === 'string' ? parts.join('') : parts[0]);
    }
  };
  page.window.HTMLAnchorElement.prototype.click = function () {
    got.push(this.download);
  };
  return got;
}
function exportAs(page, format) {
  const select = bar(page).querySelector('select');
  select.value = format;
  Array.from(bar(page).querySelectorAll('button'))
    .find((b) => b.textContent === 'Export')
    .click();
}

describe('whiteboard files on the browser editor’s page', () => {
  // proves: board_exchange
  test('the bar is closed until opened, and a JSON Canvas file brought in is copied into the note as a board', async () => {
    const page = await livePage(NOTE);
    try {
      await until(() => bar(page), 8000);
      assert.equal(bar(page).open, false, 'closed until it is opened');
      assert.equal(
        bar(page).querySelector('div').hidden,
        true,
        'its words take no place on the page while it is closed',
      );
      assert.equal(bar(page).querySelector('summary').textContent, 'Import or export boards');
      bring(page, 'My ideas.canvas', CANVAS);
      await until(() => /graph: My_ideas · BOARD/.test(page.file()), 8000);
      assert.match(page.file(), /\(n1:Card \{x: 0, y: 0, w: 200, h: 100, text: 'From Obsidian'\}\)/);
      assert.ok(page.file().startsWith(NOTE.trimEnd()), 'the rest of the note is kept');
    } finally {
      await page.stop();
    }
  });

  // proves: board_exchange
  test('a file that is no whiteboard file is refused in a sentence, and nothing is written', async () => {
    const page = await livePage(NOTE);
    try {
      await until(() => bar(page), 8000);
      bring(page, 'Bad.canvas', 'nonsense');
      await until(() => status(page), 8000);
      assert.match(status(page), /not a JSON Canvas file/);
      assert.equal(page.file(), NOTE);
    } finally {
      await page.stop();
    }
  });

  // proves: board_exchange
  test('the boards are handed over as JSON Canvas, Excalidraw and SVG files, with what was left out said', async () => {
    const page = await livePage(NOTE);
    try {
      await until(() => bar(page), 8000);
      const got = kept(page);
      assert.deepEqual(
        [...bar(page).querySelectorAll('option')].map((o) => o.textContent),
        ['JSON Canvas', 'Excalidraw', 'SVG pictures', 'PNG pictures', 'One PDF'],
        'each format is named by a word of the catalogue',
      );
      exportAs(page, 'canvas');
      await until(() => status(page), 8000);
      assert.equal(got[1], 'ideas.canvas');
      assert.equal(JSON.parse(got[0]).nodes[0].text, 'Go by train');
      assert.match(status(page), /Boards handed over as files: 1\. 1 items were left out/);
      exportAs(page, 'excalidraw');
      await until(() => got.length === 4, 8000);
      assert.equal(got[3], 'ideas.excalidraw');
      assert.equal(JSON.parse(got[2]).type, 'excalidraw');
      exportAs(page, 'svg');
      await until(() => got.length === 6, 8000);
      assert.equal(got[5], 'ideas.svg');
      assert.match(got[4], /^<svg xmlns=.*Go by train/s);
      assert.equal(page.file(), NOTE, 'the note is never written by an export');
    } finally {
      await page.stop();
    }
  });
});
