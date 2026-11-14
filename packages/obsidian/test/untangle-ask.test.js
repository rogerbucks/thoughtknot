// The filter by what things hold, in the Filter panel (editor spec §25, untangle_ask_filter). A person picks a kind and
// tests, or, while AI is on, writes what they want or how to change the filter. The words go through the one send
// dialog. What comes back only fills the rows, marked as written by AI. Nothing shows until Show these, and nothing is
// written to the note. The fake host never reaches the network.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const DATA = `// graph: work
(roof:Task {name: 'Roof', status: 'late', owner: 'Sam'}),
(walls:Task {name: 'Walls', status: 'done', owner: 'Ana'}),
(floor:Task {name: 'Floor', status: 'late', owner: 'Ana'}),
(roof)-[:NEEDS {weight: 3}]->(walls), (floor)-[:NEEDS]->(roof)`;
const NOTE = `---\nclassification: Public\n---\n# Work\n\n${fence(DATA)}\n`;
const LOCAL = {
  name: 'Local',
  purpose: 'Proposing changes',
  ceiling: 'Internal',
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: 'llama3',
};
const ON = { data: { settings: { aiUse: 'on', aiPublic: 'note', aiModels: [LOCAL] } } };
const answer = (body) => async () => ({
  status: 200,
  text: JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }),
});
const LATE = { on: 'things', of: 'Task', tests: [{ field: 'status', op: 'is', value: 'late' }] };
const LATE_SAM = {
  on: 'things',
  of: 'Task',
  tests: [
    { field: 'status', op: 'is', value: 'late' },
    { field: 'owner', op: 'is', value: 'Sam' },
  ],
};
const dialog = (env) => env.state.modals.at(-1);
const inDialog = (m, label) =>
  m.contentEl.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);
const keys = (el, cls) =>
  el
    .querySelectorAll('g.node')
    .filter((g) => g.hasClass(cls))
    .map((g) => g.getAttribute('data-key'))
    .sort();
const panelOf = (el) => el.querySelector('.thoughtknot-filter-ask');
const said = (el) => panelOf(el).querySelector('[role="status"]').textContent;
const pickIn = (row, label, value) => {
  const s = row.querySelector(`select[aria-label="${label}"]`);
  s.value = value;
  s.dispatch('change');
};

/** The card drawn and its Filter panel open. */
async function opened(env) {
  const { el } = await show(env, NOTE, 0);
  labelled(el, 'Filter by kind or link').click();
  return el;
}

/** Writes `words` in the ask box, presses Ask AI and answers `body` in the send dialog. */
async function ask(env, el, words, body) {
  const box = panelOf(el).querySelector('[name="filter-ask"]');
  box.value = words;
  labelled(panelOf(el), 'Ask AI').click();
  await until(() => !!dialog(env));
  const m = dialog(env);
  inDialog(m, 'Show what will be sent').click();
  await until(() => m.contentEl.querySelector('.thoughtknot-ai-body'));
  const sent = m.contentEl.querySelector('.thoughtknot-ai-body').textContent;
  env.state.reply = answer(body);
  inDialog(m, 'Send').click();
  return sent;
}

describe('untangle_ask_filter', () => {
  test('built by hand, it counts, fades the rest, hides it if asked, starts again, and writes nothing', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await opened(env);
      const panel = panelOf(el);
      assert.ok(panel, 'first in the Filter panel');
      assert.equal(panel.querySelector('[name="filter-ask"]'), null, 'no ask box while AI is off');
      const row = panel.querySelector('.thoughtknot-rule-test');
      pickIn(row, 'Of which kind or type', 'Task');
      const tests = panel.querySelectorAll('.thoughtknot-rule-test');
      pickIn(tests[1], 'Property', 'status');
      const value = tests[1].querySelector('input');
      value.value = 'late';
      value.dispatch('input');
      assert.match(said(el), /Keeps 2 of 3\./);
      assert.deepEqual(keys(el, 'thoughtknot-dim'), [], 'nothing changes before Show these');
      labelled(panel, 'Show these').click();
      assert.deepEqual(keys(el, 'thoughtknot-kept'), ['floor', 'roof']);
      assert.deepEqual(keys(el, 'thoughtknot-dim'), ['walls'], 'the rest fades: nothing moves or goes');
      assert.match(
        el.querySelector('.thoughtknot-untangle').textContent,
        /Showing 2 things: Task where status is late/,
      );
      const hide = panel.querySelector('.thoughtknot-filter-ask-hide input');
      hide.checked = true;
      hide.dispatch('change');
      assert.deepEqual(keys(el, 'thoughtknot-hidden'), ['walls']);
      labelled(panel, 'Start again').click();
      assert.deepEqual(keys(el, 'thoughtknot-hidden'), []);
      assert.deepEqual(keys(el, 'thoughtknot-dim'), []);
      assert.equal(env.state.files.get(PATH), NOTE, 'the note is untouched');
    } finally {
      env.uninstall();
    }
  });

  test('asked in words, the answer only fills the rows, marked as by AI; a change is asked with the filter as it is', async () => {
    const env = await load({ files: { [PATH]: NOTE }, ...ON });
    try {
      const el = await opened(env);
      const sent = await ask(env, el, 'late tasks', LATE);
      assert.match(sent, /Question: late tasks/);
      await until(() => /Written by AI/.test(said(el)));
      assert.equal(env.state.requests.length, 1, 'one send');
      assert.match(said(el), /Keeps 2 of 3\./);
      assert.deepEqual(keys(el, 'thoughtknot-dim'), [], 'the AI shows nothing by itself');
      const again = await ask(env, el, 'only those Sam owns', LATE_SAM);
      assert.match(again, /The filter now keeps: Task where status is late\. Change it/, 'add, take out or reset');
      await until(() => /Keeps 1 of 3/.test(said(el)));
      labelled(panelOf(el), 'Show these').click();
      assert.deepEqual(keys(el, 'thoughtknot-kept'), ['roof']);
      // a row the person changes is theirs: the AI label goes
      const value = panelOf(el).querySelectorAll('.thoughtknot-rule-test')[2].querySelector('input');
      value.value = 'Ana';
      value.dispatch('input');
      assert.doesNotMatch(said(el), /Written by AI/);
      assert.equal(env.state.files.get(PATH), NOTE, 'the note is untouched');
    } finally {
      env.uninstall();
    }
  });

  test('an answer about links fills nothing', async () => {
    const env = await load({ files: { [PATH]: NOTE }, ...ON });
    try {
      const el = await opened(env);
      await ask(env, el, 'needs links', { on: 'links', of: 'NEEDS', tests: [{ field: 'weight', op: 'is', value: 3 }] });
      await until(() => /not a filter on things, so nothing was filled in/.test(said(el)));
      assert.ok(labelled(panelOf(el), 'Show these').disabled, 'nothing to show');
    } finally {
      env.uninstall();
    }
  });
});
