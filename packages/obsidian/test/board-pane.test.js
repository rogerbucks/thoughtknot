// The board as the main screen in Obsidian (editor spec ES§45, board_main_screen). A note with graphs opens with its
// board beside it. A note with no board opens on a starter board, written only once changed. One line says what
// changed, with a way back to the note alone, and a command brings the board back. The built plugin, against the
// stand-ins.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, settled, until } from './host/load-plugin.js';

before(() => build());

const PATH = 'Trip.md';
const NOTE = [
  '# Trip',
  '```gql',
  '// graph: trip',
  '(paris:City), (lyon:City), (paris)-[:ROAD]->(lyon)',
  '```',
  '',
].join('\n');
/** The leaves holding the board pane. */
const panes = (env) => env.app.workspace.getLeavesOfType('thoughtknot-board');
const pane = (env) => panes(env)[0]?.view?.contentEl;
/** The note opened in front, as Obsidian tells its plug-ins. */
const opened = (env, path) => {
  env.state.active = path;
  env.app.workspace.tell('file-open', env.app.workspace.getActiveFile());
};

describe('a note opened in Obsidian', () => {
  // proves: board_main_screen
  test('with a graph and no board opens a starter board beside it, writes it only once changed, and says how back', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      opened(env, PATH);
      await until(() => !!pane(env)?.querySelector('[data-item="view1"]'), 8000);
      assert.equal(panes(env)[0].how, 'split', 'beside the note');
      assert.match(pane(env).querySelector('.thoughtknot-board-first').textContent, /open on a board/);
      assert.equal(env.state.files.get(PATH), NOTE, 'opening the note changes nothing in it');
      const vp = pane(env).querySelector('.thoughtknot-viewport');
      vp.focus();
      vp.dispatch('keydown', { key: 'Tab', target: vp });
      vp.dispatch('keydown', { key: 'ArrowDown', shiftKey: true, target: vp });
      await until(() => env.state.files.get(PATH).includes('BOARD ON trip'), 8000);
      assert.ok(env.state.files.get(PATH).startsWith(NOTE.trimEnd()), 'the note as it was comes first');
      assert.match(env.state.files.get(PATH), /\(view1:View \{x: 0, y: 50, w: 480, h: 360, of: 'trip'\}\)/);
    } finally {
      env.uninstall();
    }
  });

  // proves: board_main_screen
  test('the way back shows the note alone from then on, and the command brings the board back', async () => {
    const env = await load({ files: { [PATH]: NOTE, 'Words.md': '# Just words\n' } });
    try {
      opened(env, 'Words.md');
      for (let i = 0; i < 5; i++) await settled();
      assert.equal(panes(env).length, 0, 'a note with no graph opens alone');
      opened(env, PATH);
      await until(() => !!pane(env)?.querySelector('.thoughtknot-board-first button'), 8000);
      pane(env).querySelector('.thoughtknot-board-first button').click();
      assert.equal(panes(env).length, 0, 'the note alone');
      opened(env, PATH);
      for (let i = 0; i < 5; i++) await settled();
      assert.equal(panes(env).length, 0, 'and so from then on');
      await env.state.commands.find((c) => c.id === 'open-board').callback();
      await until(() => !!pane(env)?.querySelector('[data-item="view1"]'), 8000);
      assert.equal(pane(env).querySelector('.thoughtknot-board-first'), null, 'chosen, so no line about the change');
    } finally {
      env.uninstall();
    }
  });
});

const MANY_PATH = 'Ideas.md';
const MANY = [
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
const manyPane = (env) => env.app.workspace.getLeavesOfType('thoughtknot-board')[0]?.view?.contentEl;

describe('a note with many boards opened in Obsidian', () => {
  // proves: board_many
  test('shows one board in front, and the list switches to another and adds a new one to the note', async () => {
    const env = await load({ files: { [MANY_PATH]: MANY } });
    try {
      env.state.active = MANY_PATH;
      env.app.workspace.tell('file-open', env.app.workspace.getActiveFile());
      await until(() => !!manyPane(env)?.querySelector('[data-item="a"]'), 8000);
      const list = () => manyPane(env).querySelector('.thoughtknot-board-list');
      const press = (words) =>
        list()
          .querySelectorAll('button')
          .find((b) => b.textContent === words)
          .click();
      assert.equal(list().querySelector('summary').textContent, 'Boards: ideas, 1 of 2');
      assert.equal(manyPane(env).querySelector('[data-item="b"]'), null, 'one board in front');
      press('plan');
      await until(() => !!manyPane(env).querySelector('[data-item="b"]'), 8000);
      assert.equal(manyPane(env).querySelector('[data-item="a"]'), null);
      assert.equal(env.state.files.get(MANY_PATH), MANY, 'switching writes nothing');
      press('New board');
      await until(() => env.state.files.get(MANY_PATH).endsWith('```gql\n// graph: board · BOARD\n```\n'), 8000);
      await until(() => list().querySelector('summary').textContent === 'Boards: board, 3 of 3', 8000);
    } finally {
      env.uninstall();
    }
  });
});
