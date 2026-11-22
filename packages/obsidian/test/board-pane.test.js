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
      // a note with no graph and no board opens on an empty board, and nothing is written (ES§76, board_first_new_note)
      opened(env, 'Words.md');
      await until(() => !!pane(env)?.querySelector('.thoughtknot-board-ways'), 8000);
      assert.equal(pane(env).querySelectorAll('[data-item]').length, 0, 'an empty board');
      assert.equal(env.state.files.get('Words.md'), '# Just words\n', 'the note is unchanged');
      opened(env, PATH);
      // the pane has turned to this note's board before its way back is pressed
      await until(() => !!pane(env)?.querySelector('[data-item="view1"]'), 8000);
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

const NESTED = [
  '# Ideas',
  '```gql',
  '// graph: ideas · BOARD',
  "(v:View {x: 0, y: 0, w: 400, h: 300, board: 'plan'})",
  '```',
  '',
  '```gql',
  '// graph: plan · BOARD',
  "(b:Sticky {x: 10, y: 20, text: 'Book it'})",
  '```',
  '',
].join('\n');

describe('a board inside a board opened in Obsidian', () => {
  // proves: board_nested
  test('is entered by Enter on its view, and the trail above is the way back out', async () => {
    const env = await load({ files: { [MANY_PATH]: NESTED } });
    try {
      env.state.active = MANY_PATH;
      env.app.workspace.tell('file-open', env.app.workspace.getActiveFile());
      const item = (id) => manyPane(env)?.querySelector(`[data-item="${id}"]`);
      await until(() => !!item('v'), 8000);
      const vp = manyPane(env).querySelector('.thoughtknot-viewport');
      vp.focus();
      vp.dispatch('keydown', { key: 'Tab', target: vp });
      vp.dispatch('keydown', { key: 'Enter', target: vp });
      await until(() => !item('v') && !!item('b'), 8000);
      const back = manyPane(env).querySelector('.thoughtknot-board-trail button');
      assert.equal(back.textContent, 'ideas');
      back.click();
      await until(() => !!item('v'), 8000);
      assert.equal(manyPane(env).querySelector('.thoughtknot-board-trail'), null);
      assert.equal(env.state.files.get(MANY_PATH), NESTED, 'going in and out writes nothing');
    } finally {
      env.uninstall();
    }
  });
});

const TEAM = [
  '# Team',
  '```gql',
  '// graph: team',
  "(ann:Person {name: 'Ann'}), (bob:Person {name: 'Bob'}), (ann)-[:KNOWS]->(bob)",
  '```',
  '',
].join('\n');

describe('a board proposed in Obsidian', () => {
  // proves: board_proposed
  test('from the graph is shown first, and written to the note only when kept', async () => {
    const env = await load({ files: { [MANY_PATH]: TEAM } });
    try {
      env.state.active = MANY_PATH;
      env.app.workspace.tell('file-open', env.app.workspace.getActiveFile());
      await until(() => !!manyPane(env)?.querySelector('[data-item="view1"]'), 8000);
      const press = (words) =>
        manyPane(env)
          .querySelectorAll('button')
          .find((b) => b.textContent === words)
          .click();
      press('Propose a board from the graph');
      await until(() => !!manyPane(env).querySelector('.thoughtknot-board-draft [data-item="note1"]'), 8000);
      assert.equal(env.state.files.get(MANY_PATH), TEAM, 'a proposal writes nothing');
      assert.equal(
        manyPane(env).querySelector('.thoughtknot-board-list-ask'),
        null,
        'no box to ask an AI while AI is off',
      );
      press('Keep this board');
      await until(() => env.state.files.get(MANY_PATH).includes('graph: team_views · BOARD ON team'), 8000);
      await until(() => !manyPane(env).querySelector('.thoughtknot-board-draft'), 8000);
    } finally {
      env.uninstall();
    }
  });
});

const LOCAL = {
  name: 'Local',
  purpose: 'Proposing changes',
  ceiling: 'Internal',
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: 'llama3',
};
const AI_ON = { data: { settings: { aiUse: 'on', aiPublic: 'note', aiModels: [LOCAL] } } };
const PUBLIC_TEAM = `---\nclassification: Public\n---\n${TEAM}`;
const answered = (body) => async () => ({
  status: 200,
  text: JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }),
});

describe('a board asked of an AI in Obsidian', () => {
  // proves: board_proposed
  test('goes through the send dialog, is shown as a proposal that cites what was read, and writes nothing', async () => {
    const env = await load({ files: { [MANY_PATH]: PUBLIC_TEAM }, ...AI_ON });
    try {
      env.state.active = MANY_PATH;
      env.app.workspace.tell('file-open', env.app.workspace.getActiveFile());
      await until(() => !!manyPane(env)?.querySelector('.thoughtknot-board-list-ask'), 8000);
      const ask = manyPane(env).querySelector('.thoughtknot-board-list-ask');
      ask.querySelector('input').value = 'who knows whom?';
      ask.querySelector('button').click();
      await until(() => !!env.state.modals.at(-1), 8000);
      const m = env.state.modals.at(-1);
      const button = (label) =>
        m.contentEl.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);
      button('Show what will be sent').click();
      await until(() => m.contentEl.querySelector('.thoughtknot-ai-body'));
      assert.match(m.contentEl.querySelector('.thoughtknot-ai-body').textContent, /Question: who knows whom\?/);
      assert.deepEqual(env.state.requests, [], 'nothing is sent until Send is pressed');
      env.state.reply = answered({
        board: { name: 'knows', items: [{ view: 'matrix', reason: 'each pair', read: ['ann', 'bob'] }] },
      });
      button('Send').click();
      await until(() => !!manyPane(env).querySelector('.thoughtknot-board-draft [data-item="view1"]'), 8000);
      assert.equal(env.state.requests.length, 1, 'one send');
      assert.match(
        manyPane(env).querySelector('.thoughtknot-board-draft-cited li').textContent,
        /view1: Read ann, bob: each pair/,
      );
      assert.equal(env.state.files.get(MANY_PATH), PUBLIC_TEAM, 'the answer writes nothing');
    } finally {
      env.uninstall();
    }
  });
});
