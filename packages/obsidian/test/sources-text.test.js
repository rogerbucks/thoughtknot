// A block drawn from a .txt file in the plug-in (editor spec §63, connector_text_proposed). The card says its words
// are drawn only as a proposal. Its button opens text to graph on them. Each thing kept cites the file and its line,
// and nothing is written until a person ticks it. The fake host never reaches the network.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const TXT = 'Notes/hiring.txt';
const PROSE = 'Acme Ltd hired Alice Smith.\nShe now runs the Berlin office.\n';
// the fake host's notes are drawn as the note at this path
const NOTE_PATH = 'Some note.md';
const note = ['---', 'classification: Public', '---', '# Hiring', '', fence(`// graph: hiring · FROM ${TXT}`), ''].join(
  '\n',
);
const LOCAL = {
  name: 'Local',
  purpose: 'Proposing changes',
  ceiling: 'Internal',
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: 'llama3',
};
const ON = { settings: { aiUse: 'on', aiPublic: 'note', aiModels: [LOCAL] } };
const ANSWER = {
  things: [
    { name: 'alice', kind: 'Employee', text: 'Alice Smith', quote: 'Alice Smith' },
    { name: 'berlin', kind: 'Office', text: 'Berlin office', quote: 'the Berlin office' },
  ],
  links: [{ from: 'alice', type: 'RUNS', to: 'berlin', quote: 'runs the Berlin office' }],
};
const reply = async () => ({
  status: 200,
  text: JSON.stringify({ choices: [{ message: { content: JSON.stringify(ANSWER) } }] }),
});
const labelled = (el, label) => el.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);
const named = (el, text) => el.querySelectorAll('button').find((b) => b.textContent.includes(text));
function choose(m, name, value) {
  const row = m.contentEl
    .querySelectorAll('.setting-item')
    .find((r) => r.querySelector('.setting-item-name')?.textContent === name);
  const sel = row.querySelector('select');
  sel.value = value;
  sel.dispatch('change');
}

describe('a block drawn from a .txt file', () => {
  test('while AI is off, the card says why and its button sends nothing', async () => {
    const env = await load({ files: { [NOTE_PATH]: note, [TXT]: PROSE } });
    try {
      const { el } = await show(env, note, 0);
      await until(() => el.querySelector('[role="alert"]'));
      assert.match(el.querySelector('[role="alert"]').textContent, /only as a proposal/);
      named(el, `Propose a graph from ${TXT}`).click();
      await until(() => env.state.notices.length);
      assert.equal(env.state.modals.length, 0);
      assert.equal(env.state.files.get(NOTE_PATH), note);
    } finally {
      env.uninstall();
    }
  });

  test('its button proposes a graph, each thing citing the file and line, written only when ticked', async () => {
    const env = await load({ files: { [NOTE_PATH]: note, [TXT]: PROSE }, data: ON });
    try {
      const { el } = await show(env, note, 0);
      await until(() => el.querySelector('[role="alert"]'));
      named(el, `Propose a graph from ${TXT}`).click();
      await until(() => env.state.modals.length);
      const m = env.state.modals.at(-1);
      choose(m, 'Model', 'Local');
      labelled(m.contentEl, 'Show what will be sent').click();
      assert.match(m.contentEl.textContent, /the file Notes\/hiring\.txt/);
      assert.match(m.contentEl.querySelector('.thoughtknot-ai-body').textContent, /Acme Ltd hired Alice Smith/);
      env.state.reply = reply;
      labelled(m.contentEl, 'Send').click();
      await until(() => env.state.modals.some((x) => x.titleEl?.textContent?.includes('Keep what the AI found')));
      const review = env.state.modals.at(-1);
      assert.match(review.contentEl.textContent, /Notes\/hiring\.txt, line 2: "the Berlin office"/);
      assert.equal(env.state.files.get(NOTE_PATH), note, 'nothing is written before it is ticked');
      labelled(review.contentEl, 'Write the ticked ones').click();
      await until(() => env.state.files.get(NOTE_PATH) !== note);
      assert.match(env.state.files.get(NOTE_PATH), /\(alice:Employee \{name: 'Alice Smith'\}\)/);
      assert.equal(env.state.files.get(TXT), PROSE, 'the text file is never written');
    } finally {
      env.uninstall();
    }
  });
});
