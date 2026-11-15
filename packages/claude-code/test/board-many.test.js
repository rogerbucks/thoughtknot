// Many boards in one note on the browser editor's page (editor spec §45, board_many). VS Code's tab, the desktop app
// and the phone app run this page. One board is in front, under a list of the note's boards, folded at first. The
// list switches between them, and adds, renames, copies and removes one, each written to the note on disk. The page
// runs as built, in a DOM, against the real server.
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
  "(a:Sticky {x: 10, y: 20, text: 'Go by train'})",
  '```',
  '',
  '```gql',
  '// graph: plan · BOARD',
  "(b:Sticky {x: 10, y: 20, text: 'Book it'})",
  '```',
  '',
].join('\n');

describe('a note with many boards on the browser editor’s page', () => {
  // proves: board_many
  test('shows one board in front under a folded list, and the list switches, adds, renames, copies and removes', async () => {
    const page = await livePage(NOTE);
    try {
      const list = () => page.doc.querySelector('.gn-boards .thoughtknot-board-list');
      const item = (id) => page.doc.querySelector(`.gn-boards .thoughtknot-board [data-item="${id}"]`);
      const press = (words) =>
        Array.from(list().querySelectorAll('button'))
          .find((b) => b.textContent === words)
          .click();
      await until(() => item('a'), 8000);
      assert.equal(page.doc.querySelectorAll('.gn-boards .thoughtknot-board').length, 1, 'one board in front');
      assert.ok(!list().hasAttribute('open'), 'the list starts folded');
      assert.equal(list().querySelector('summary').textContent, 'Boards: ideas, 1 of 2');
      assert.equal(item('b'), null);

      press('plan');
      await until(() => item('b'), 8000);
      assert.equal(item('a'), null, 'the other board has gone behind');
      assert.ok(page.doc.querySelector('.gn-boards .thoughtknot-board-glide'), 'the board switched to glides in');
      assert.equal(list().querySelector('[aria-current="true"]').textContent, 'plan');
      assert.equal(page.file(), NOTE, 'switching writes nothing');

      press('New board');
      await until(() => /\/\/ graph: board · BOARD\n```\n$/.test(page.file()), 8000);
      await until(() => list().querySelector('summary').textContent === 'Boards: board, 3 of 3', 8000);

      press('Rename this board');
      const input = list().querySelector('input');
      input.value = 'plan';
      input.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await until(() => /plan/.test(list().querySelector('[role="status"]').textContent), 8000);
      assert.match(page.file(), /graph: board · BOARD/, 'a taken name is refused and nothing is written');
      input.value = 'later';
      input.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await until(() => /\/\/ graph: later · BOARD/.test(page.file()), 8000);
      await until(() => list().querySelector('summary').textContent === 'Boards: later, 3 of 3', 8000);

      press('plan');
      await until(() => item('b'), 8000);
      press('Copy this board');
      await until(() => /graph: plan_copy · BOARD\n\(b:Sticky/.test(page.file()), 8000);
      await until(() => list().querySelector('summary').textContent === 'Boards: plan_copy, 4 of 4', 8000);

      press('Remove this board');
      assert.match(page.file(), /plan_copy/, 'removing asks first');
      press('Yes, remove it');
      await until(() => !/plan_copy/.test(page.file()), 8000);
      await until(() => list().querySelector('summary').textContent === 'Boards: later, 3 of 3', 8000);
      assert.match(page.file(), /Go by train/, 'the other boards are untouched');
      assert.match(page.file(), /Book it/);
    } finally {
      await page.stop();
    }
  });
});
