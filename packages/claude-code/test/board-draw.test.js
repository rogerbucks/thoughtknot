// Drawing and formatting on a board on the browser editor's page (editor spec §45, board_ink, board_format). Pen and
// Eraser draw and rub out strokes, and the Format bar sets the look of the items chosen. Each edit is written to the note
// on disk, and the page runs as built, in a DOM, against the real server.
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

describe('drawing and formatting on the browser editor’s page', () => {
  // proves: board_format
  test('formats the items chosen from the Format bar: one press colours both, and the bar stays as it was', async () => {
    const page = await livePage(NOTE);
    try {
      const board = () => page.doc.querySelector('.gn-boards .thoughtknot-board');
      const vp = () => board()?.querySelector('.thoughtknot-viewport');
      await until(() => vp()?.querySelector('[data-item="a"]'), 8000);
      const format = () => board().querySelector('.thoughtknot-board-format');
      const look = (name) => format().querySelector(`[data-look="${name}"]`);
      assert.ok(format().querySelector('.thoughtknot-board-format-looks').hidden, 'the looks start folded');
      for (const id of ['a', 'b'])
        vp()
          .querySelector(`[data-item="${id}"]`)
          .dispatchEvent(
            new page.window.PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, shiftKey: true }),
          );
      format().querySelector('button').click();
      assert.ok(!format().querySelector('.thoughtknot-board-format-looks').hidden);
      look('colour-pink').click();
      await until(() => (page.file().match(/style: 'pink'/g) ?? []).length === 2, 8000);
      assert.match(page.file(), /\(a:Sticky \{x: 10, y: 20, text: 'Go by train', style: 'pink'\}\)/, 'nothing moved');
      // the page draws the board afresh from the note: both are still chosen, and the bar still open on them
      await until(() => look('colour-pink')?.getAttribute('aria-pressed') === 'true', 8000);
      assert.equal(vp().querySelectorAll('[data-item].is-chosen').length, 2);
      look('bold').click();
      await until(() => (page.file().match(/bold: true/g) ?? []).length === 2, 8000);
    } finally {
      await page.stop();
    }
  });

  // proves: board_ink
  test('draws a stroke with the Pen as one Ink item, keeps drawing until Escape, and the Eraser rubs it out', async () => {
    const page = await livePage(NOTE);
    try {
      const board = () => page.doc.querySelector('.gn-boards .thoughtknot-board');
      const vp = () => board()?.querySelector('.thoughtknot-viewport');
      await until(() => vp()?.querySelector('[data-item="a"]'), 8000);
      const rail = () => board().querySelector('.thoughtknot-board-tools');
      const tool = (name) => rail().querySelector(`[data-tool="${name}"]:not(.thoughtknot-board-tools-fold)`);
      rail().querySelector('.thoughtknot-board-tools-fold').click();
      const fire = (type, x, y) => {
        vp().setPointerCapture = () => {}; // the fake window has none, and the board may be drawn afresh
        return vp().dispatchEvent(
          new page.window.PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            button: 0,
            pointerId: 7,
            clientX: x,
            clientY: y,
          }),
        );
      };
      const stroke = (from) => {
        fire('pointerdown', from, 300);
        for (let i = 1; i <= 6; i++) fire('pointermove', from + i * 20, 300 + (i % 2) * 15);
        fire('pointerup', from + 140, 300);
      };
      tool('pen').click();
      assert.ok(vp().classList.contains('is-inking'), 'a drag now draws, so touch is the pen alone');
      const before = page.file();
      stroke(100);
      await until(
        () => /\(ink1:Ink \{x: -?\d+, y: -?\d+, w: \d+, h: \d+, points: '[\d -]+'\}\)/.test(page.file()),
        8000,
      );
      assert.ok(page.file().includes("(a:Sticky {x: 10, y: 20, text: 'Go by train'})"), 'nothing else moved');
      assert.notEqual(page.file(), before);
      await until(() => vp().querySelector('[data-item="ink1"] path'), 8000);
      assert.equal(tool('pen').getAttribute('aria-pressed'), 'true', 'the Pen stays for the next stroke');

      // the Eraser rubs out the stroke it crosses, and a stroke it does not cross stays
      tool('eraser').click();
      fire('pointerdown', 150, 600);
      fire('pointerup', 160, 600);
      assert.match(page.file(), /\(ink1:Ink /, 'far from the stroke, nothing is erased');
      fire('pointerdown', 100, 300);
      fire('pointermove', 140, 300);
      fire('pointerup', 200, 300);
      await until(() => !/ink1:Ink/.test(page.file()), 8000);
      vp().dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      assert.equal(tool('choose').getAttribute('aria-pressed'), 'true', 'Escape lets go of the tool');
      assert.ok(!vp().classList.contains('is-inking'));
    } finally {
      await page.stop();
    }
  });
});
