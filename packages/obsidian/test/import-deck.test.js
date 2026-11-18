// Import offers the PowerPoint decks of the vault (ES§45 board_exchange, ES§67 format_untrusted_files). The deck is
// read in the worker when picked, so one that cannot be read is said at once. Adding writes one board into the note, a
// frame to each slide, and keeps the pictures among the note's attachments. The deck itself is never written.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG, deck, pic, sp } from '../../core/test/pptx-fixture.js';
import { build, load, until } from './host/load-plugin.js';

before(() => build());

const PATH = 'Plan.md';
const NOTE = '# Plan\n\nWhat we agreed.\n';
const FILE = 'Data/Q4 plan.pptx';
const row = (el, name) =>
  el.querySelectorAll('.setting-item').find((r) => r.querySelector('.setting-item-name')?.textContent === name);
const button = (m, text) => m.contentEl.querySelectorAll('button').find((b) => b.textContent.includes(text));
async function open(env) {
  env.state.activeView = new env.obsidian.MarkdownView(env.app.vault.getAbstractFileByPath(PATH), NOTE, 'source');
  await env.state.commands.find((c) => c.id === 'import-from-database').callback();
  return env.state.modals.at(-1);
}
function choose(m, value) {
  const sel = row(m.contentEl, 'Database file').querySelector('select');
  sel.value = value;
  sel.dispatch('change');
}
const DECK = deck([
  {
    shapes: [
      sp({ ph: { type: 'title' }, paras: ['Q4 plan'] }),
      pic({ embed: 'rId5', at: [700, 200, 400, 300], alt: 'Logo' }),
    ],
    media: { rId5: ['logo.png', PNG] },
    notes: ['Open warmly'],
  },
  { shapes: [sp({ ph: { type: 'title' }, paras: ['Risks'] })] },
]);

describe('Import offers the .pptx files of the vault', () => {
  test('it is listed, picking writes nothing, and adding writes one board and keeps the pictures beside the note', async () => {
    const env = await load({ files: { [PATH]: NOTE, [FILE]: DECK } });
    try {
      const m = await open(env);
      assert.deepEqual(
        row(m.contentEl, 'Database file')
          .querySelectorAll('option')
          .map((o) => o.textContent),
        ['Choose a file', FILE],
      );
      choose(m, '0');
      await until(() => button(m, 'Add to note'));
      assert.equal(env.state.files.get(PATH), NOTE, 'nothing is written by picking');
      assert.equal(row(m.contentEl, 'Graph name').querySelector('input').value, 'Q4_plan');
      assert.match(m.contentEl.textContent, /frame of one board/);
      const said = env.state.notices.length;
      button(m, 'Add to note').click();
      await until(() => env.state.notices.length > said);
      assert.match(
        env.state.notices.at(-1),
        /Added the board Q4_plan, a frame to each slide of .*Q4 plan\.pptx, to Plan\./,
      );
      assert.match(env.state.notices.at(-1), /Colours, fonts, backgrounds/);
      const note = env.state.files.get(PATH);
      assert.match(note, /\/\/ graph: Q4_plan · BOARD/);
      assert.match(note, /\(s1:Frame \{[^}]*text: 'Q4 plan'[^}]*slide: 1\}\)/);
      assert.match(note, /src: 'attachments\/Q4-plan-1\.png'/);
      assert.deepEqual([...new Uint8Array(env.state.files.get('attachments/Q4-plan-1.png'))], [...PNG]);
      assert.deepEqual(env.state.files.get(FILE), DECK, 'the deck is never written');
    } finally {
      env.uninstall();
    }
  });

  test('a file that is not a deck is said at once and nothing can be added', async () => {
    const env = await load({ files: { [PATH]: NOTE, 'Data/bad.pptx': new Uint8Array([1, 2, 3]) } });
    try {
      const m = await open(env);
      choose(m, '0');
      await until(() => m.contentEl.querySelector('[role="alert"]'));
      assert.match(m.contentEl.querySelector('[role="alert"]').textContent, /not a PowerPoint/);
      assert.equal(button(m, 'Add to note'), undefined);
      assert.equal(env.state.files.get(PATH), NOTE);
    } finally {
      env.uninstall();
    }
  });
});
