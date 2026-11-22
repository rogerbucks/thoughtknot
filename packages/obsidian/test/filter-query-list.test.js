// The queries asked in words, listed in the Filter panel (editor spec ES§75). Each shows its words beside the filter
// they became, and the words can be changed to ask again (ai_query_words_kept). Each is shown as a filter or a
// highlight (ai_query_highlight), can be locked (ai_query_lock) and stepped back. A query that fails says why and keeps
// the words (ai_query_fails_open). The engine is filter.ts; this proves the panel wires it. The fake host never
// reaches the network.
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
const test1 = (field, value) => ({ field, op: 'is', value });
const LATE = { on: 'things', of: 'Task', tests: [test1('status', 'late')] };
const LATE_SAM = { on: 'things', of: 'Task', tests: [test1('status', 'late'), test1('owner', 'Sam')] };
const NOBODY = { on: 'things', of: 'Task', tests: [test1('owner', 'Nobody')] };
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
const items = (el) => panelOf(el).querySelectorAll('.thoughtknot-query');
const itemText = (item) => item.querySelector('.thoughtknot-query-rule').textContent;
const wordsOf = (item) => item.querySelector('[name="query-words"]');
const banner = (el) => el.querySelector('.thoughtknot-untangle').textContent;
const enter = (input) => input.dispatch('keydown', { key: 'Enter' });

/** The card drawn and its Filter panel open. */
async function opened(env) {
  const { el } = await show(env, NOTE, 0);
  labelled(el, 'Filter by kind or link').click();
  return el;
}

/** Sends the open dialog's ask, answered by `reply`, and gives what was sent. */
async function send(env, reply) {
  await until(() => !!dialog(env));
  const m = dialog(env);
  inDialog(m, 'Show what will be sent').click();
  await until(() => m.contentEl.querySelector('.thoughtknot-ai-body'));
  const sent = m.contentEl.querySelector('.thoughtknot-ai-body').textContent;
  env.state.reply = reply;
  inDialog(m, 'Send').click();
  return sent;
}

/** Writes `words` in the ask box, presses Ask AI and answers `body`. */
async function ask(env, el, words, body) {
  const box = panelOf(el).querySelector('[name="filter-ask"]');
  box.value = words;
  const opened = env.state.modals.length;
  labelled(panelOf(el), 'Ask AI').click();
  await until(() => env.state.modals.length > opened);
  return send(env, typeof body === 'function' ? body : answer(body));
}

describe('ai_query_words_kept, in the panel', () => {
  test('the words stay beside their filter; new words refine it, a hand edit unmatches them, Step back undoes', async () => {
    const env = await load({ files: { [PATH]: NOTE }, ...ON });
    try {
      const el = await opened(env);
      await ask(env, el, 'late tasks', LATE);
      await until(() => items(el).length === 1);
      assert.equal(wordsOf(items(el)[0]).value, 'late tasks', 'the words asked, kept');
      assert.match(itemText(items(el)[0]), /Task where status is late/, 'beside the filter they became');
      const again = await ask(env, el, 'only those Sam owns', LATE_SAM);
      assert.match(again, /The filter now keeps: Task where status is late\. Change it/, 'sent with it as it stands');
      await until(() => /owner is Sam/.test(itemText(items(el)[0])));
      assert.equal(items(el).length, 1, 'refined, not a second query');
      assert.equal(wordsOf(items(el)[0]).value, 'only those Sam owns');
      // a hand edit keeps the words, marked as no longer matching
      const value = panelOf(el).querySelectorAll('.thoughtknot-rule-test')[2].querySelector('input');
      value.value = 'Ana';
      value.dispatch('input');
      assert.match(itemText(items(el)[0]), /owner is Ana/);
      assert.match(itemText(items(el)[0]), /no longer match/);
      assert.equal(wordsOf(items(el)[0]).value, 'only those Sam owns');
      labelled(items(el)[0], 'Step back').click();
      assert.match(itemText(items(el)[0]), /owner is Sam/);
      assert.doesNotMatch(itemText(items(el)[0]), /no longer match/);
      labelled(items(el)[0], 'Step back').click();
      assert.equal(wordsOf(items(el)[0]).value, 'late tasks');
      assert.doesNotMatch(itemText(items(el)[0]), /owner/);
      assert.ok(labelled(items(el)[0], 'Step back').disabled, 'nothing before the first');
      // the words themselves are edited, and Enter asks again with the filter as it stands
      const words = wordsOf(items(el)[0]);
      words.value = 'late tasks Sam owns';
      enter(words);
      const edited = await send(env, answer(LATE_SAM));
      assert.match(edited, /The filter now keeps: Task where status is late\. Change it/);
      await until(() => wordsOf(items(el)[0]).value === 'late tasks Sam owns');
      assert.match(itemText(items(el)[0]), /owner is Sam/);
      assert.equal(env.state.files.get(PATH), NOTE, 'the note is untouched');
    } finally {
      env.uninstall();
    }
  });
});

describe('ai_query_highlight, in the panel', () => {
  test('a query switches between a filter and a highlight; a highlight fades and hides nothing', async () => {
    const env = await load({ files: { [PATH]: NOTE }, ...ON });
    try {
      const el = await opened(env);
      await ask(env, el, 'late tasks', LATE);
      await until(() => items(el).length === 1);
      labelled(panelOf(el), 'Show these').click();
      assert.deepEqual(keys(el, 'thoughtknot-dim'), ['walls'], 'shown as a filter first');
      const as = items(el)[0].querySelector('select[name="query-show"]');
      assert.equal(as.value, 'filter');
      as.value = 'highlight';
      as.dispatch('change');
      assert.deepEqual(keys(el, 'thoughtknot-dim'), [], 'a highlight fades nothing');
      assert.deepEqual(keys(el, 'thoughtknot-hidden'), [], 'and hides nothing');
      assert.match(banner(el), /Highlighting 2 things: late tasks/);
      as.value = 'filter';
      as.dispatch('change');
      assert.deepEqual(keys(el, 'thoughtknot-dim'), ['walls'], 'switched back at any time');
      assert.equal(env.state.files.get(PATH), NOTE, 'switching writes nothing to the note');
    } finally {
      env.uninstall();
    }
  });
});

describe('ai_query_lock, in the panel', () => {
  test('a locked query shows its mark and refuses asking, hand edits and Step back until unlocked', async () => {
    const env = await load({ files: { [PATH]: NOTE }, ...ON });
    try {
      const el = await opened(env);
      await ask(env, el, 'late tasks', LATE);
      await until(() => items(el).length === 1);
      await ask(env, el, 'only those Sam owns', LATE_SAM);
      await until(() => /owner is Sam/.test(itemText(items(el)[0])));
      const lock = labelled(items(el)[0], 'Lock this query');
      lock.click();
      assert.match(itemText(items(el)[0]), /🔒/, 'a lock mark');
      assert.equal(labelled(items(el)[0], 'Unlock this query').getAttribute('aria-pressed'), 'true');
      assert.ok(labelled(items(el)[0], 'Step back').disabled, 'no step back while locked');
      assert.ok(wordsOf(items(el)[0]).disabled, 'its words cannot be changed');
      const rows = panelOf(el).querySelectorAll('.thoughtknot-rule-test');
      assert.ok(rows[2].querySelector('input').disabled, 'nor its filter by hand');
      const box = panelOf(el).querySelector('[name="filter-ask"]');
      box.value = 'all tasks';
      const before = env.state.modals.length;
      labelled(panelOf(el), 'Ask AI').click();
      assert.match(said(el), /locked/);
      assert.equal(env.state.modals.length, before, 'nothing is sent');
      labelled(items(el)[0], 'Unlock this query').click();
      assert.doesNotMatch(itemText(items(el)[0]), /🔒/);
      assert.ok(!labelled(items(el)[0], 'Step back').disabled, 'it changes again once unlocked');
    } finally {
      env.uninstall();
    }
  });
});

describe('ai_query_fails_open, in the panel', () => {
  test('a failed send or a filter that keeps nothing says why, keeps the words and leaves what was shown', async () => {
    const env = await load({ files: { [PATH]: NOTE }, ...ON });
    try {
      const el = await opened(env);
      await ask(env, el, 'late tasks', LATE);
      await until(() => items(el).length === 1);
      labelled(panelOf(el), 'Show these').click();
      await ask(env, el, 'tasks nobody owns', NOBODY);
      await until(() => /keeps nothing/.test(said(el)));
      assert.match(said(el), /your words are kept to try again/);
      assert.equal(panelOf(el).querySelector('[name="filter-ask"]').value, 'tasks nobody owns', 'the words kept');
      assert.match(itemText(items(el)[0]), /Task where status is late/, 'the query as it was');
      assert.deepEqual(keys(el, 'thoughtknot-dim'), ['walls'], 'the graph shown as before');
      await ask(env, el, 'tasks Sam owns', async () => ({ status: 500, text: 'down' }));
      // a send that fails: the AI's refusal is said in words, the words and the drawing kept
      await until(() => /refused the request/.test(said(el)));
      assert.match(said(el), /your words are kept to try again/);
      assert.equal(panelOf(el).querySelector('[name="filter-ask"]').value, 'tasks Sam owns');
      assert.deepEqual(keys(el, 'thoughtknot-dim'), ['walls']);
      assert.equal(env.state.files.get(PATH), NOTE);
    } finally {
      env.uninstall();
    }
  });
});
