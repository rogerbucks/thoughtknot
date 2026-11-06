// A whiteboard on the browser editor's page (editor spec §45, board_view, board_keyboard). VS Code's tab, the desktop
// app and the phone app run this page. A board block opens there as it does in Obsidian. It is drawn in a viewport
// that zooms by keys and is worked by the keyboard. Each edit is written to the note on disk. The page runs as built,
// in a DOM, against the real server.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { until } from '../../obsidian/test/host/load-plugin.js';
import { cleanUp } from './editor-page-support.js';
import { livePage } from './editor-page-live.js';
import { boardEdit } from '../../core/src/board-edit.ts';

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

  // proves: board_live_together, board_presence, board_offline_merge
  test('a shared board is edited through its seat, shows the others and its clashes, and moves nothing on its own', async () => {
    const block = [
      '// graph: ideas · BOARD',
      "(a:Sticky {x: 10, y: 20, text: 'Go by train'}),",
      "(b:Card {x: 300, y: 20, w: 160, h: 90, text: 'Paris', clash: 'b2'}),",
      "(b2:Card {x: 300, y: 200, w: 160, h: 90, text: 'Rome', clash: 'b'})",
    ].join('\n');
    const state = { text: block, peers: [], watchers: [], told: [], changes: [] };
    const seat = {
      me: 'me',
      peers: () => state.peers,
      announce: (here) => state.told.push(here),
      watch: (f) => state.watchers.push(f),
      text: () => state.text,
      change: async (c) => {
        state.changes.push(c);
        const r = boardEdit(state.text, c);
        if ('refused' in r) return r.refused;
        state.text = r.text;
        return undefined;
      },
    };
    const bo = { id: 'bo', name: 'Bo', selection: ['a'], pointer: [50, 60], seen: Date.now() };
    state.peers = [{ id: 'me', name: 'Ada', selection: [], seen: Date.now() }, bo];
    const page = await livePage(['# Ideas', '```gql', block, '```', ''].join('\n'), {
      before: (w) => {
        w.thoughtknotSeat = () => seat;
      },
    });
    try {
      const root = () => page.doc.querySelector('.gn-boards .thoughtknot-board');
      const vp = () => root()?.querySelector('.thoughtknot-viewport');
      await until(() => vp()?.querySelector('[data-item="a"]'), 8000);
      const key = (k, more = {}) =>
        vp().dispatchEvent(
          new page.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...more }),
        );
      const said = () => root().querySelector('.thoughtknot-board-said')?.textContent ?? '';
      const rect = (id) => vp().querySelector(`[data-item="${id}"] rect`)?.getAttribute('y');
      const note = page.file();

      // the others are drawn over the board, by a shape and an initial, and are listed with a way to go to them
      assert.ok(vp().querySelector('.thoughtknot-presence [data-peer="bo"]'), 'Bo is drawn');
      assert.match(vp().querySelector('[data-peer="bo"]').textContent, /B/);
      assert.ok(root().querySelector('.thoughtknot-board-people button[aria-label="Go to Bo"]'));
      // a clash is flagged on its items and listed, with a button to settle it
      assert.ok(vp().querySelector('[data-item="b"] [data-clash="b2"]'), 'flagged on the item');
      assert.equal(root().querySelectorAll('.thoughtknot-board-clashes button').length, 2);

      // another person's change redraws the board in place: what they moved moves, and nothing else does
      const wide = vp().querySelector('svg').getAttribute('width');
      state.text = state.text.replace("x: 10, y: 20, text: 'Go by train'", "x: 10, y: 90, text: 'Go by train'");
      for (const f of state.watchers) f();
      assert.equal(rect('a'), '90', 'their move is drawn');
      assert.equal(rect('b'), '20', 'the rest stays put');
      assert.equal(vp().querySelector('svg').getAttribute('width'), wide, 'the view is not changed');

      // our keyboard edit goes through the seat, not the page's own write, and we tell the others what is in focus
      key('Tab');
      assert.ok(
        state.told.some((h) => h.selection.length === 1),
        'the focus is told',
      );
      key('ArrowDown', { shiftKey: true });
      await until(() => state.changes.some((c) => c.kind === 'move'), 8000);
      assert.equal(page.file(), note, 'the page wrote nothing of its own');

      // settling a clash writes the item without its flag, and moves nothing
      root().querySelector('.thoughtknot-board-clashes button').click();
      await until(() => state.changes.some((c) => c.kind === 'put'), 8000);
      await until(() => root().querySelectorAll('.thoughtknot-board-clashes button').length === 1, 8000);
      assert.doesNotMatch(state.text, /\(b:Card \{[^}]*clash/);
      assert.equal(rect('b'), '20');

      // going to a person is asked for, and said
      root().querySelector('button[aria-label="Go to Bo"]').click();
      assert.match(said(), /Showing where Bo is/);
    } finally {
      await page.stop();
    }
  });
});
