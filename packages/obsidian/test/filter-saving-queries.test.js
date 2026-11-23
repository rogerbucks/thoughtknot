// A query saved by name, in the Filter panel (editor spec ES§75). The built plugin, loaded against the stand-ins for
// the page. Requirements: ai_query_saved, ai_query_replay, ai_query_stale.
// - A saved query is listed with its prompts. Open runs its rule on the graph as it is now, with nothing sent.
// - Remove asks first. A no changes nothing; a yes takes out only its own two lines.
// - Its name is changed in place, in both its lines.
// - In reading view it can be opened, but not renamed or removed.
// - One whose kind is gone says so, and keeps its words.
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
const styled = (kind) =>
  [
    '```gql',
    '// graph: work_style · STYLE work',
    `(named_1:NamedFilter {name: 'Late', kind: '${kind}', when: 'status == "late"'}),`,
    `(query_1:SavedQuery {name: 'Late', filter: 'Late', words: '["late tasks"]', show: 'filter', locked: false})`,
    '```',
  ].join('\n');
const NOTE = `---\nclassification: Public\n---\n# Work\n\n${fence(DATA)}\n`;
const WITH_SAVED = `${NOTE}\n${styled('Task')}\n`;
const panelOf = (el) => el.querySelector('.thoughtknot-filter-ask');
const said = (el) => panelOf(el).querySelector('[role="status"]').textContent;
const item = (el, name = 'Late') => panelOf(el).querySelector(`[data-saved="${name}"]`);
const keys = (el, cls) =>
  el
    .querySelectorAll('g.node')
    .filter((g) => g.hasClass(cls))
    .map((g) => g.getAttribute('data-key'))
    .sort();

/** The card for the note's graph block, in edit mode or reading view, with its Filter panel open. */
async function card(note, editing) {
  const env = await load({ files: { [PATH]: note } });
  const page = env.doc.body.createDiv({ cls: editing ? 'markdown-source-view' : 'markdown-reading-view' });
  const el = page.createDiv({ cls: 'block-language-gql' });
  await env.state.processors.get('gql')(DATA, el, fakeContext(note, note.split('\n').indexOf('```gql')));
  await until(() => el.querySelector('g.node'));
  labelled(el, 'Filter by kind or link').click();
  return { env, el };
}

/** The question asked in a modal, answered `yes` or not. */
function answer(env, yes) {
  const modal = env.state.modals.at(-1);
  assert.ok(modal, 'a question was asked');
  const text = modal.contentEl.querySelector('p').textContent;
  const said = yes ? 'Go ahead' : 'Cancel';
  modal.contentEl
    .querySelectorAll('button')
    .find((b) => b.textContent === said)
    .click();
  return text;
}

// proves: ai_query_saved, ai_query_replay
test('a saved query is listed with its prompts, and Open runs its rule with nothing sent', async () => {
  const { env, el } = await card(WITH_SAVED, true);
  try {
    const it = item(el);
    assert.ok(it, 'the saved query is listed');
    assert.match(it.textContent, /late tasks/);
    labelled(it, 'Open').click();
    assert.match(said(el), /Opened the saved query Late\. Nothing was sent\./);
    assert.equal(panelOf(el).querySelector('.thoughtknot-query input[name="query-words"]').value, 'late tasks');
    assert.deepEqual(keys(el, 'thoughtknot-kept'), ['floor', 'roof']);
    assert.equal(env.state.requests.length, 0, 'nothing was sent');
  } finally {
    env.plugin.onunload();
    env.uninstall();
  }
});

// proves: ai_query_saved
test('Remove asks first: a no changes nothing, a yes takes out only its own two lines', async () => {
  const { env, el } = await card(WITH_SAVED, true);
  try {
    labelled(item(el), 'Remove').click();
    assert.match(answer(env, false), /Remove the saved query Late\?/);
    await until(() => env.state.modals.length === 0);
    assert.equal(env.state.files.get(PATH), WITH_SAVED, 'a no changes nothing');
    labelled(item(el), 'Remove').click();
    answer(env, true);
    await until(() => !env.state.files.get(PATH).includes('SavedQuery'));
    const now = env.state.files.get(PATH);
    assert.doesNotMatch(now, /NamedFilter/, 'its filter line went with it');
    assert.ok(now.startsWith(NOTE.trimEnd()), 'the graph is not changed');
    assert.match(env.state.notices.at(-1), /Removed the saved query Late/);
  } finally {
    env.plugin.onunload();
    env.uninstall();
  }
});

// proves: ai_query_saved
test('a saved query is renamed in place, in both its lines', async () => {
  const { env, el } = await card(WITH_SAVED, true);
  try {
    const name = item(el).querySelector('input[name="saved-query-name"]');
    name.value = 'Overdue';
    name.dispatch('change');
    await until(() => env.state.files.get(PATH).includes("name: 'Overdue'"));
    const now = env.state.files.get(PATH);
    assert.match(now, /NamedFilter \{name: 'Overdue'/);
    assert.match(now, /SavedQuery \{name: 'Overdue', filter: 'Overdue'/);
    assert.doesNotMatch(now, /'Late'/);
  } finally {
    env.plugin.onunload();
    env.uninstall();
  }
});

// proves: ai_query_saved
test('in reading view a saved query can be opened, but not renamed or removed', async () => {
  const { env, el } = await card(WITH_SAVED, false);
  try {
    assert.ok(labelled(item(el), 'Open'));
    assert.equal(labelled(item(el), 'Remove'), undefined);
    assert.ok(item(el).querySelector('input[name="saved-query-name"]').disabled);
  } finally {
    env.plugin.onunload();
    env.uninstall();
  }
});

// proves: ai_query_stale
test('a saved query whose kind is gone says so, and keeps its words', async () => {
  const note = `${NOTE}\n${styled('Job')}\n`;
  const { env, el } = await card(note, true);
  try {
    const it = item(el);
    assert.match(it.textContent, /No longer fits this note: the kind Job is gone\. Ask again to fit it\./);
    assert.match(it.textContent, /late tasks/);
    assert.equal(env.state.requests.length, 0, 'nothing was sent by itself');
  } finally {
    env.plugin.onunload();
    env.uninstall();
  }
});
