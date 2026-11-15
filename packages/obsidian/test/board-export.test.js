// Whiteboard files in and out in Obsidian (editor spec ES§45, board_exchange). Import offers the JSON Canvas files and
// Excalidraw drawings of the vault, and copies the one picked into the note as a board. Two commands write the boards
// of the note in front as files beside it. A file is never replaced, and the note is never written by an export.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';

before(() => build());

const PATH = 'Trips/Plan.md';
const NOTE = '# Plan\n\nWhat we agreed.\n';
const CANVAS = JSON.stringify({
  nodes: [
    { id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'Go by train' },
    { id: 'b', type: 'hologram', x: 0, y: 0, width: 1, height: 1 },
  ],
  edges: [],
});
const DRAWING = JSON.stringify({
  type: 'excalidraw',
  elements: [{ id: 'r', type: 'rectangle', x: 0, y: 0, width: 100, height: 50 }],
});
const BOARD =
  "```gql\n// graph: ideas · BOARD\n(a:Sticky {x: 0, y: 0, text: 'Go by train'}),\n(v:View {x: 0, y: 400})\n```\n";
const row = (el, name) =>
  el.querySelectorAll('.setting-item').find((r) => r.querySelector('.setting-item-name')?.textContent === name);
const button = (m, text) => m.contentEl.querySelectorAll('button').find((b) => b.textContent.includes(text));
function front(env, text, mode = 'source') {
  env.state.activeView = new env.obsidian.MarkdownView(env.app.vault.getAbstractFileByPath(PATH), text, mode);
}
async function open(env) {
  front(env, NOTE);
  await env.state.commands.find((c) => c.id === 'import-from-database').callback();
  return env.state.modals.at(-1);
}
function choose(m, value) {
  const sel = row(m.contentEl, 'Database file').querySelector('select');
  sel.value = value;
  sel.dispatch('change');
}

describe('Import offers the whiteboard files of the vault', () => {
  // proves: board_exchange
  test('a JSON Canvas file is listed, picking writes nothing, and adding copies it in as a board', async () => {
    const file = 'Trips/My ideas.canvas';
    const env = await load({ files: { [PATH]: NOTE, [file]: CANVAS } });
    try {
      const m = await open(env);
      choose(m, '0');
      await until(() => button(m, 'Add to note'));
      assert.equal(env.state.files.get(PATH), NOTE, 'nothing is written by picking');
      assert.equal(row(m.contentEl, 'Graph name').querySelector('input').value, 'My_ideas', 'a name is offered');
      assert.match(m.contentEl.textContent, /copied into this note/);
      const said = env.state.notices.length;
      button(m, 'Add to note').click();
      await until(() => env.state.notices.length > said);
      assert.match(env.state.notices.at(-1), /Added the board My_ideas, copied from .*My ideas\.canvas, to Plan/);
      assert.match(env.state.notices.at(-1), /1 items were left out/, 'what was left out is said');
      assert.equal(
        env.state.files.get(PATH),
        `${NOTE.trimEnd()}\n\n\`\`\`gql\n// graph: My_ideas · BOARD\n(a:Card {x: 0, y: 0, w: 200, h: 100, text: 'Go by train'})\n\`\`\`\n`,
      );
      assert.equal(env.state.files.get(file), CANVAS, 'the file is never written');
    } finally {
      env.uninstall();
    }
  });

  // proves: board_exchange
  test('an Excalidraw drawing is copied in, and a file that is no drawing is said and writes nothing', async () => {
    const env = await load({ files: { [PATH]: NOTE, 'Bad.excalidraw': 'nonsense', 'Sketch.excalidraw': DRAWING } });
    try {
      const m = await open(env);
      choose(m, '0');
      await until(() => m.contentEl.querySelector('[role="alert"]'));
      assert.match(m.contentEl.querySelector('[role="alert"]').textContent, /not an Excalidraw drawing/);
      assert.equal(button(m, 'Add to note'), undefined);
      choose(m, '1');
      await until(() => button(m, 'Add to note'));
      const said = env.state.notices.length;
      button(m, 'Add to note').click();
      await until(() => env.state.notices.length > said);
      assert.match(env.state.files.get(PATH), /\/\/ graph: Sketch · BOARD\n\(r:Shape \{/);
    } finally {
      env.uninstall();
    }
  });
});

describe('The boards of a note are exported as whiteboard files', () => {
  for (const [id, ending, check] of [
    ['export-boards-canvas', 'canvas', (out) => assert.equal(out.nodes[0].text, 'Go by train')],
    ['export-boards-excalidraw', 'excalidraw', (out) => assert.equal(out.type, 'excalidraw')],
  ]) {
    // proves: board_exchange
    test(`${id}: each board is written beside the note, in reading view too, and no file is replaced`, async () => {
      const taken = `Trips/Plan ideas.${ending}`;
      const env = await load({ files: { [PATH]: NOTE + BOARD, [taken]: 'mine' } });
      try {
        front(env, NOTE + BOARD, 'preview');
        const said = env.state.notices.length;
        await env.state.commands.find((c) => c.id === id).callback();
        await until(() => env.state.notices.length > said);
        const path = `Trips/Plan ideas-2.${ending}`;
        assert.match(
          env.state.notices.at(-1),
          new RegExp(`Wrote Trips/Plan ideas-2\\.${ending}\\. 1 items were left out`),
        );
        check(JSON.parse(env.state.files.get(path)));
        assert.equal(env.state.files.get(taken), 'mine', 'the file already there is kept');
        assert.equal(env.state.files.get(PATH), NOTE + BOARD, 'the note is never written');
      } finally {
        env.uninstall();
      }
    });
  }

  // proves: board_exchange
  test('a note with no board, and no note in front, are said and write nothing', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const run = env.state.commands.find((c) => c.id === 'export-boards-canvas').callback;
      await run();
      await until(() => env.state.notices.length);
      assert.match(env.state.notices.at(-1), /Open a note first/);
      front(env, NOTE);
      await run();
      await until(() => env.state.notices.length > 1);
      assert.match(env.state.notices.at(-1), /holds no board/);
      assert.deepEqual([...env.state.files.keys()], [PATH]);
    } finally {
      env.uninstall();
    }
  });
});
