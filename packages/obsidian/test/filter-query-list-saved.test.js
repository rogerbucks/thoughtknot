// A query asked in words, saved by name and its answer kept on this device (editor spec ES§75). The built plugin,
// loaded against the stand-ins for the page; the fake host never reaches the network.
// Requirements: ai_query_saved, ai_query_cache, ai_query_replay.
// - Save keeps the query worked on: its words and its filter, as a SavedQuery line and its NamedFilter line.
// - The same words asked again of a note with the same kinds and properties reuse the answer, with nothing sent.
// - Clearing the kept answers sends the next ask again.
// - Ask again shows the prompts first; a no sends nothing, a yes sends them and opens the query.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fakeContext } from './host/fake-obsidian.js';
import { fence, labelled } from './host/notes.js';

before(() => build());

const PATH = 'Some note.md';
const DATA = `// graph: work
(roof:Task {name: 'Roof', status: 'late', owner: 'Sam'}),
(walls:Task {name: 'Walls', status: 'done', owner: 'Ana'}),
(floor:Task {name: 'Floor', status: 'late', owner: 'Ana'}),
(roof)-[:NEEDS]->(walls), (floor)-[:NEEDS]->(roof)`;
const NOTE = `---\nclassification: Public\n---\n# Work\n\n${fence(DATA)}\n`;
const LOCAL = {
  name: 'Local',
  purpose: 'Proposing changes',
  ceiling: 'Internal',
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: 'llama3',
};
const ON = { data: { settings: { aiUse: 'on', aiPublic: 'note', aiModels: [LOCAL] } } };
const LATE = { on: 'things', of: 'Task', tests: [{ field: 'status', op: 'is', value: 'late' }] };
const answer = (body) => async () => ({
  status: 200,
  text: JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }),
});
const panelOf = (el) => el.querySelector('.thoughtknot-filter-ask');
const said = (el) => panelOf(el).querySelector('[role="status"]').textContent;
const items = (el) => panelOf(el).querySelectorAll('.thoughtknot-query');
const dialog = (env) => env.state.modals.at(-1);
const inDialog = (m, label) =>
  m.contentEl.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);
const byText = (m, text) => m.contentEl.querySelectorAll('button').find((b) => b.textContent === text);

/** The card in edit mode, with its Filter panel open. */
async function card(env, note) {
  const page = env.doc.body.createDiv({ cls: 'markdown-source-view' });
  const el = page.createDiv({ cls: 'block-language-gql' });
  await env.state.processors.get('gql')(DATA, el, fakeContext(note, note.split('\n').indexOf('```gql')));
  await until(() => el.querySelector('g.node'));
  labelled(el, 'Filter by kind or link').click();
  return el;
}

/** Sends the open send dialog's ask, answered by `body`. */
async function send(env, body) {
  await until(() => !!dialog(env));
  const m = dialog(env);
  inDialog(m, 'Show what will be sent').click();
  await until(() => m.contentEl.querySelector('.thoughtknot-ai-body'));
  env.state.reply = answer(body);
  inDialog(m, 'Send').click();
}

/** Writes `words` in the ask box and presses Ask AI. */
function ask(el, words) {
  panelOf(el).querySelector('[name="filter-ask"]').value = words;
  labelled(panelOf(el), 'Ask AI').click();
}

// proves: ai_query_cache
test('the same words asked again reuse the kept answer with nothing sent, until it is cleared', async () => {
  const env = await load({ files: { [PATH]: NOTE }, ...ON });
  try {
    const el = await card(env, NOTE);
    ask(el, 'late tasks');
    await send(env, LATE);
    await until(() => items(el).length === 1);
    const sent = env.state.requests.length;
    labelled(panelOf(el), 'Start again').click();
    const modals = env.state.modals.length;
    ask(el, 'late  tasks ');
    await until(() => items(el).length === 2);
    assert.match(said(el), /Used the answer kept on this device\. Nothing was sent\./);
    assert.equal(env.state.requests.length, sent, 'nothing was sent');
    assert.equal(env.state.modals.length, modals, 'no send was shown');
    labelled(panelOf(el), 'Clear kept answers').click();
    assert.match(said(el), /Cleared the answers kept on this device/);
    labelled(panelOf(el), 'Start again').click();
    ask(el, 'late tasks');
    await until(() => env.state.modals.length > modals, 'cleared, it is sent again');
  } finally {
    env.plugin.onunload();
    env.uninstall();
  }
});

// proves: ai_query_saved
test('Save keeps the query worked on: its words as a SavedQuery line, its filter as a NamedFilter line', async () => {
  const env = await load({ files: { [PATH]: NOTE }, ...ON });
  try {
    const el = await card(env, NOTE);
    ask(el, 'late tasks');
    await send(env, LATE);
    await until(() => items(el).length === 1);
    labelled(panelOf(el), 'Save this filter by name').click();
    const name = panelOf(el).querySelector('input[name="filter-name"]');
    name.value = 'Late';
    labelled(panelOf(el), 'Save').click();
    await until(() => env.state.files.get(PATH).includes('SavedQuery'));
    const now = env.state.files.get(PATH);
    assert.match(now, /NamedFilter \{name: 'Late', kind: 'Task', when: 'status == "late"'\}/);
    assert.match(now, /SavedQuery \{name: 'Late', filter: 'Late', words: '\["late tasks"\]', show: 'filter'/);
    assert.ok(now.startsWith(NOTE.trimEnd()), 'the data is untouched');
  } finally {
    env.plugin.onunload();
    env.uninstall();
  }
});

// proves: ai_query_replay
test('Ask again shows each prompt first: a no sends nothing, a yes sends them and opens the query', async () => {
  const style = [
    '```gql',
    '// graph: work_style · STYLE work',
    `(named_1:NamedFilter {name: 'Late', kind: 'Task', when: 'status == "late"'}),`,
    `(query_1:SavedQuery {name: 'Late', filter: 'Late', words: '["late tasks"]', show: 'filter', locked: false})`,
    '```',
  ].join('\n');
  const note = `${NOTE}\n${style}\n`;
  const env = await load({ files: { [PATH]: note }, ...ON });
  try {
    const el = await card(env, note);
    const again = () => labelled(panelOf(el).querySelector('[data-saved="Late"]'), 'Ask again').click();
    again();
    await until(() => !!dialog(env));
    assert.match(dialog(env).contentEl.textContent, /Ask again sends this prompt.*1\. late tasks/);
    byText(dialog(env), 'Cancel').click();
    await until(() => /Nothing was sent\./.test(said(el)));
    assert.equal(env.state.requests.length, 0);
    again();
    await until(() => !!dialog(env));
    byText(dialog(env), 'Go ahead').click();
    await send(env, LATE);
    await until(() => items(el).length === 1);
    assert.equal(env.state.requests.length, 1, 'its one prompt was sent once');
  } finally {
    env.plugin.onunload();
    env.uninstall();
  }
});

// proves: ai_query_fuzzy
test('words the answer fits to no rule are told so, with a wording that names the note’s properties', async () => {
  const env = await load({ files: { [PATH]: NOTE }, ...ON });
  try {
    const el = await card(env, NOTE);
    ask(el, 'the vibes are off');
    await until(() => !!dialog(env));
    const m = dialog(env);
    inDialog(m, 'Show what will be sent').click();
    await until(() => m.contentEl.querySelector('.thoughtknot-ai-body'));
    env.state.reply = async () => ({
      status: 200,
      text: JSON.stringify({ choices: [{ message: { content: 'no idea, sorry' } }] }),
    });
    inDialog(m, 'Send').click();
    await until(() => /fit no rule/.test(said(el)));
    assert.match(said(el), /This note’s properties are .*owner/);
    assert.equal(env.state.requests.length, 1, 'nothing more was sent');
    assert.equal(items(el).length, 0, 'the drawing is as it was');
  } finally {
    env.plugin.onunload();
    env.uninstall();
  }
});

// proves: ai_query_replay
test('Ask again whose send is closed unsent says nothing was sent', async () => {
  const style = [
    '```gql',
    '// graph: work_style · STYLE work',
    `(named_1:NamedFilter {name: 'Late', kind: 'Task', when: 'status == "late"'}),`,
    `(query_1:SavedQuery {name: 'Late', filter: 'Late', words: '["late tasks"]', show: 'filter', locked: false})`,
    '```',
  ].join('\n');
  const note = `${NOTE}\n${style}\n`;
  const env = await load({ files: { [PATH]: note }, ...ON });
  try {
    const el = await card(env, note);
    labelled(panelOf(el).querySelector('[data-saved="Late"]'), 'Ask again').click();
    await until(() => !!dialog(env));
    byText(dialog(env), 'Go ahead').click();
    await until(() => !!dialog(env));
    dialog(env).close();
    await until(() => /Nothing was sent\./.test(said(el)));
    assert.equal(env.state.requests.length, 0);
  } finally {
    env.plugin.onunload();
    env.uninstall();
  }
});
