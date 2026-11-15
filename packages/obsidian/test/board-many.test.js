// Many boards in one note in Obsidian (editor spec ES§45, board_many). The board pane shows one board in front, under
// a list of the note's boards. The list switches between them and adds one, written to the note. The built plugin,
// against the stand-ins.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';

before(() => build());

const PATH = 'Ideas.md';
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
const pane = (env) => env.app.workspace.getLeavesOfType('thoughtknot-board')[0]?.view?.contentEl;

describe('a note with many boards opened in Obsidian', () => {
  // proves: board_many
  test('shows one board in front, and the list switches to another and adds a new one to the note', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      env.state.active = PATH;
      env.app.workspace.tell('file-open', env.app.workspace.getActiveFile());
      await until(() => !!pane(env)?.querySelector('[data-item="a"]'), 8000);
      const list = () => pane(env).querySelector('.thoughtknot-board-list');
      const press = (words) =>
        list()
          .querySelectorAll('button')
          .find((b) => b.textContent === words)
          .click();
      assert.equal(list().querySelector('summary').textContent, 'Boards: ideas, 1 of 2');
      assert.equal(pane(env).querySelector('[data-item="b"]'), null, 'one board in front');
      press('plan');
      await until(() => !!pane(env).querySelector('[data-item="b"]'), 8000);
      assert.equal(pane(env).querySelector('[data-item="a"]'), null);
      assert.equal(env.state.files.get(PATH), NOTE, 'switching writes nothing');
      press('New board');
      await until(() => env.state.files.get(PATH).endsWith('```gql\n// graph: board · BOARD\n```\n'), 8000);
      await until(() => list().querySelector('summary').textContent === 'Boards: board, 3 of 3', 8000);
    } finally {
      env.uninstall();
    }
  });
});
