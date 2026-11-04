// A whiteboard on the browser editor's page (editor spec §45, board_view, board_keyboard). VS Code's tab, the desktop
// app and the phone app run this page. A board block opens there as it does in Obsidian. It is drawn in a viewport
// that zooms by keys and is worked by the keyboard. Each edit is written to the note on disk. The page runs as built,
// in a DOM, against the real server.
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
  "(b:Card {x: 300, y: 20, w: 160, h: 90, text: 'Paris'}),",
  '(a)-[:CONNECTS]->(b)',
  '```',
  '',
].join('\n');

describe('a board on the browser editor’s page', () => {
  // proves: board_view, board_keyboard
  test('opens as a board that zooms by keys, and an item moved by keys is written to the note', async () => {
    const page = await livePage(NOTE);
    try {
      const vp = () => page.doc.querySelector('.gn-boards .thoughtknot-board .thoughtknot-viewport');
      await until(() => vp(), 8000);
      assert.equal(vp().getAttribute('aria-roledescription'), 'whiteboard');
      assert.ok(vp().querySelector('svg [data-item="a"]'), 'its items drawn');
      const key = (k, more = {}) =>
        vp().dispatchEvent(
          new page.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...more }),
        );
      const width = () => Number(vp().querySelector('svg').getAttribute('width'));
      const fit = width();
      key('+');
      assert.ok(width() > fit, 'zoomed in');
      key('Tab');
      const said = () => page.doc.querySelector('.gn-boards .thoughtknot-board-said')?.textContent ?? '';
      assert.match(said(), /Sticky note: Go by train/);
      key('ArrowDown', { shiftKey: true });
      await until(() => /\(a:Sticky \{x: 10, y: 70, text: 'Go by train'\}\)/.test(page.file()), 8000);
      await until(() => vp().querySelector('[data-item="a"] rect')?.getAttribute('y') === '70', 8000); // drawn again
      assert.ok(page.file().includes("(b:Card {x: 300, y: 20, w: 160, h: 90, text: 'Paris'})"), 'b stays put');
    } finally {
      await page.stop();
    }
  });
});
