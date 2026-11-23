// AI queries on a phone (editor spec ES§75, in the phone's sheet of ES§25 controls_sheet). Roger, 22 Nov 2026: "Full
// on the phone". The built plugin, loaded against the stand-ins as a phone; the fake host never reaches the network.
// Requirements: controls_sheet, ai_query_sends_ruled and ai_query_words_kept. Also ai_query_highlight, ai_query_lock
// and ai_query_merge. Also ai_query_saved, ai_query_replay and ai_query_fails_open.
// - The Filter panel opens in the Controls tab of the sheet, at half height, in reach of a thumb.
// - Each send goes through the send dialog: shown first, sent once and recorded.
// - Refine, highlight, lock, merge, save, open and Ask again all work there, as on a computer.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fakeContext } from './host/fake-obsidian.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';

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
const ON = { data: { settings: { aiUse: 'on', aiPublic: 'note', aiModels: [LOCAL] } }, mobile: true };
const answer = (body) => async () => ({
  status: 200,
  text: JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }),
});
const test1 = (field, value) => ({ field, op: 'is', value });
const LATE = { on: 'things', of: 'Task', tests: [test1('status', 'late')] };
const LATE_SAM = { on: 'things', of: 'Task', tests: [test1('status', 'late'), test1('owner', 'Sam')] };
const ANA = { on: 'things', of: 'Task', tests: [test1('owner', 'Ana')] };
const dialog = (env) => env.state.modals.at(-1);
const inDialog = (m, label) =>
  m.contentEl.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);
const byText = (m, text) => m.contentEl.querySelectorAll('button').find((b) => b.textContent === text);
const sheetOf = (el) => el.querySelector('.thoughtknot-phone-sheet');
const panelOf = (el) => sheetOf(el).querySelector('.thoughtknot-filter-ask');
const said = (el) => panelOf(el).querySelector('[role="status"]').textContent;
const items = (el) => panelOf(el).querySelectorAll('.thoughtknot-query');
const itemText = (item) => item.querySelector('.thoughtknot-query-rule').textContent;
const wordsOf = (item) => item.querySelector('[name="query-words"]');
const keys = (el, cls) =>
  el
    .querySelectorAll('g.node')
    .filter((g) => g.hasClass(cls))
    .map((g) => g.getAttribute('data-key'))
    .sort();
const marked = (el) =>
  Object.fromEntries(
    el
      .querySelectorAll('g.node')
      .filter((g) => g.hasClass('thoughtknot-query-marked'))
      .map((g) => [g.getAttribute('data-key'), g.getAttribute('data-query-badge')]),
  );
const pick = (select, value) => {
  select.value = value;
  select.dispatch('change');
};

/** The card drawn on a phone, its Filter panel opened from the bar. */
async function opened(env) {
  const { el } = await show(env, NOTE, 0);
  labelled(el, 'Filter by kind or link').click();
  return el;
}

/** The card in edit mode on a phone, its Filter panel open: where a query can be saved. */
async function edited(env, note) {
  const page = env.doc.body.createDiv({ cls: 'markdown-source-view' });
  const el = page.createDiv({ cls: 'block-language-gql' });
  await env.state.processors.get('gql')(DATA, el, fakeContext(note, note.split('\n').indexOf('```gql')));
  await until(() => el.querySelector('g.node'));
  labelled(el, 'Filter by kind or link').click();
  return el;
}

/** Sends the open send dialog's ask, answered by `reply`, and gives what was shown before it was sent. */
async function send(env, reply) {
  await until(() => !!dialog(env));
  const m = dialog(env);
  inDialog(m, 'Show what will be sent').click();
  await until(() => m.contentEl.querySelector('.thoughtknot-ai-body'));
  const shown = m.contentEl.querySelector('.thoughtknot-ai-body').textContent;
  env.state.reply = reply;
  inDialog(m, 'Send').click();
  return shown;
}

/** Writes `words` in the sheet's ask box, presses Ask AI and answers `body`. */
async function ask(env, el, words, body) {
  panelOf(el).querySelector('[name="filter-ask"]').value = words;
  const opened = env.state.modals.length;
  labelled(panelOf(el), 'Ask AI').click();
  await until(() => env.state.modals.length > opened);
  return send(env, typeof body === 'function' ? body : answer(body));
}

// proves: controls_sheet
test('on a phone the Filter panel opens in the Controls tab of the sheet, at half height, not over the drawing', async () => {
  const env = await load({ files: { [PATH]: NOTE }, ...ON });
  try {
    const el = await opened(env);
    const sheet = sheetOf(el),
      panes = sheet.querySelectorAll('.thoughtknot-phone-sheet-pane');
    const panel = el.querySelector('.thoughtknot-filter-ask');
    assert.ok(panes[0].contains(panel), 'in the Controls tab of the sheet');
    assert.ok(!panel.closest('.thoughtknot-filter').hidden, 'and shown');
    assert.ok(sheet.classList.contains('is-half'), 'the sheet rises from its strip to half, so the panel can be read');
    assert.equal(el.querySelectorAll('.thoughtknot-over-panels .thoughtknot-filter').length, 0, 'not over the drawing');
    labelled(el, 'Filter by kind or link').click();
    assert.ok(panel.closest('.thoughtknot-filter').hidden, 'the bar’s button closes it again');
  } finally {
    env.uninstall();
  }
});

// proves: ai_query_sends_ruled
// proves: ai_query_words_kept
test('Ask AI in the sheet shows what will be sent, sends it once and records it; new words refine it', async () => {
  const env = await load({ files: { [PATH]: NOTE }, ...ON });
  try {
    const el = await opened(env);
    const shown = await ask(env, el, 'late tasks', LATE);
    assert.match(shown, /late tasks/, 'the words, shown before the send');
    await until(() => items(el).length === 1);
    assert.equal(env.state.requests.length, 1, 'sent once');
    await until(() => env.state.data.aiSends?.length === 1, 'and recorded');
    assert.equal(env.state.data.aiSends[0].model, 'Local');
    assert.equal(wordsOf(items(el)[0]).value, 'late tasks', 'the words kept beside the filter');
    const again = await ask(env, el, 'only those Sam owns', LATE_SAM);
    assert.match(again, /The filter now keeps: Task where status is late\. Change it/, 'sent with it as it stands');
    await until(() => /owner is Sam/.test(itemText(items(el)[0])));
    assert.equal(items(el).length, 1, 'refined, not a second query');
    await until(() => env.state.data.aiSends?.length === 2, 'each send recorded');
    labelled(items(el)[0], 'Step back').click();
    assert.doesNotMatch(itemText(items(el)[0]), /owner/, 'stepped back to the change before');
    assert.equal(env.state.files.get(PATH), NOTE, 'the note is untouched');
  } finally {
    env.uninstall();
  }
});

// proves: ai_query_highlight
// proves: ai_query_lock
test('in the sheet a query highlights with badges and hides nothing, and a lock holds it until unlocked', async () => {
  const env = await load({ files: { [PATH]: NOTE }, ...ON });
  try {
    const el = await opened(env);
    await ask(env, el, 'late tasks', LATE);
    await until(() => items(el).length === 1);
    labelled(panelOf(el), 'Show these').click();
    assert.deepEqual(keys(el, 'thoughtknot-dim'), ['walls'], 'a filter fades the rest');
    pick(items(el)[0].querySelector('select[name="query-show"]'), 'highlight');
    assert.deepEqual(keys(el, 'thoughtknot-dim'), [], 'a highlight fades nothing');
    assert.deepEqual(keys(el, 'thoughtknot-hidden'), [], 'and hides nothing');
    assert.deepEqual(marked(el), { floor: '⚑', roof: '⚑' }, 'each found thing has a badge, not colour alone');
    labelled(items(el)[0], 'Lock this query').click();
    assert.match(itemText(items(el)[0]), /🔒/, 'a lock mark');
    assert.ok(wordsOf(items(el)[0]).disabled, 'its words cannot be changed');
    panelOf(el).querySelector('[name="filter-ask"]').value = 'all tasks';
    const before = env.state.modals.length;
    labelled(panelOf(el), 'Ask AI').click();
    assert.match(said(el), /locked/);
    assert.equal(env.state.modals.length, before, 'nothing is sent while locked');
    labelled(items(el)[0], 'Unlock this query').click();
    assert.ok(!wordsOf(items(el)[0]).disabled, 'it changes again once unlocked');
  } finally {
    env.uninstall();
  }
});

// proves: ai_query_merge
test('in the sheet two queries merge as any of them, each part with its own badge named in the legend', async () => {
  const env = await load({ files: { [PATH]: NOTE }, ...ON });
  try {
    const el = await opened(env);
    await ask(env, el, 'late tasks', LATE);
    await until(() => items(el).length === 1);
    labelled(panelOf(el), 'Start again').click();
    await ask(env, el, 'tasks Ana owns', ANA);
    await until(() => items(el).length === 2);
    for (const item of items(el)) {
      const box = item.querySelector('[name="query-choose"]');
      box.checked = true;
      box.dispatch('change');
    }
    const sends = env.state.requests.length;
    labelled(panelOf(el), 'Merge the chosen').click();
    assert.equal(env.state.requests.length, sends, 'merging sends nothing');
    labelled(panelOf(el), 'Show these').click();
    pick(items(el)[2].querySelector('select[name="query-join"]'), 'any');
    pick(items(el)[2].querySelector('select[name="query-show"]'), 'highlight');
    assert.deepEqual(marked(el), { floor: '⚑★', roof: '⚑', walls: '★' }, 'a thing both find has both badges');
    const legend = el
      .querySelectorAll('.thoughtknot-untangle .thoughtknot-query-legend li')
      .map((li) => li.textContent);
    assert.deepEqual(legend, ['⚑late tasks', '★tasks Ana owns'], 'the legend names each mark');
  } finally {
    env.uninstall();
  }
});

// proves: ai_query_saved
// proves: ai_query_replay
test('in the sheet a query is saved by name, opened with nothing sent, and asked again only after a yes', async () => {
  const env = await load({ files: { [PATH]: NOTE }, ...ON });
  try {
    const el = await edited(env, NOTE);
    await ask(env, el, 'late tasks', LATE);
    await until(() => items(el).length === 1);
    labelled(panelOf(el), 'Save this filter by name').click();
    panelOf(el).querySelector('input[name="filter-name"]').value = 'Late';
    labelled(panelOf(el), 'Save').click();
    await until(() => env.state.files.get(PATH).includes('SavedQuery'));
    assert.match(env.state.files.get(PATH), /SavedQuery \{name: 'Late', filter: 'Late', words: '\["late tasks"\]'/);
    const now = env.state.files.get(PATH);
    const again = await edited(env, now);
    const sent = env.state.requests.length;
    labelled(panelOf(again).querySelector('[data-saved="Late"]'), 'Open').click();
    await until(() => items(again).length === 1);
    assert.equal(env.state.requests.length, sent, 'opening sends nothing');
    labelled(panelOf(again).querySelector('[data-saved="Late"]'), 'Ask again').click();
    await until(() => !!dialog(env));
    assert.match(dialog(env).contentEl.textContent, /1\. late tasks/, 'the prompts shown first');
    byText(dialog(env), 'Go ahead').click();
    await send(env, answer(LATE));
    await until(() => env.state.requests.length === sent + 1);
    await until(() => env.state.data.aiSends?.length === 2, 'the send asked again is recorded too');
  } finally {
    env.plugin.onunload();
    env.uninstall();
  }
});

// proves: ai_query_fails_open
test('in the sheet a send that fails says why, keeps the words, and leaves the graph as it was', async () => {
  const env = await load({ files: { [PATH]: NOTE }, ...ON });
  try {
    const el = await opened(env);
    await ask(env, el, 'tasks Sam owns', async () => ({ status: 500, text: 'down' }));
    await until(() => /refused the request/.test(said(el)));
    assert.match(said(el), /your words are kept to try again/);
    assert.equal(panelOf(el).querySelector('[name="filter-ask"]').value, 'tasks Sam owns');
    assert.deepEqual(keys(el, 'thoughtknot-dim'), [], 'nothing faded');
    assert.deepEqual(keys(el, 'thoughtknot-hidden'), [], 'nothing hidden');
  } finally {
    env.uninstall();
  }
});
