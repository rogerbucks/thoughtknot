// AI queries on a whiteboard (editor spec ES§75, on the board of ES§45 and ES§76). Roger, 22 Nov 2026: queries and
// their highlight marks work on the board too. The built plugin, loaded against the stand-ins; the fake host never
// reaches the network.
// Requirements: ai_query_highlight, ai_query_sends_ruled and ai_query_lock. Also ai_query_merge, ai_query_saved,
// ai_query_replay and ai_query_fails_open.
// - The board's Filter button opens the same panel over the board's graph, on a board linked to one.
// - A highlight marks each card linked to a thing it finds: a ring and a badge, by the one mark rule.
// - A filter fades or hides the cards linked to things it does not keep. Nothing moves; the note is untouched.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const WORK = `// graph: work
(roof:Task {name: 'Roof', status: 'late', owner: 'Sam'}),
(walls:Task {name: 'Walls', status: 'done', owner: 'Ana'}),
(floor:Task {name: 'Floor', status: 'late', owner: 'Ana'}),
(roof)-[:NEEDS]->(walls), (floor)-[:NEEDS]->(roof)`;
const BOARD = `// graph: plan · BOARD ON work
(a:Sticky {x: 0, y: 0, text: 'Roof', graph: 'roof'}),
(b:Sticky {x: 200, y: 0, text: 'Walls', graph: 'walls'}),
(c:Sticky {x: 400, y: 0, text: 'Floor', graph: 'floor'}),
(d:Sticky {x: 0, y: 200, text: 'Ask the builder'})`;
const STYLE = `// graph: work_style · STYLE work
(named_1:NamedFilter {name: 'Late', kind: 'Task', when: 'status == "late"'}),
(query_1:SavedQuery {name: 'Late', filter: 'Late', words: '["late tasks"]', show: 'highlight', locked: false})`;
const NOTE = `---\nclassification: Public\n---\n# Work\n\n${fence(BOARD)}\n\n${fence(WORK)}\n`;
const SAVED = `${NOTE}\n${fence(STYLE)}\n`;
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
const ANA = { on: 'things', of: 'Task', tests: [test1('owner', 'Ana')] };
const dialog = (env) => env.state.modals.at(-1);
const inDialog = (m, label) =>
  m.contentEl.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);
const byText = (m, text) => m.contentEl.querySelectorAll('button').find((b) => b.textContent === text);
const boardOf = (el) => el.querySelector('.thoughtknot-board');
const panelOf = (el) => boardOf(el).querySelector('.thoughtknot-filter-ask');
const said = (el) => panelOf(el).querySelector('[role="status"]').textContent;
const items = (el) => panelOf(el).querySelectorAll('.thoughtknot-query');
const itemText = (item) => item.querySelector('.thoughtknot-query-rule').textContent;
const cards = (el) => boardOf(el).querySelectorAll('svg.thoughtknot-svg [data-item]');
const card = (el, id) => cards(el).find((g) => g.getAttribute('data-item') === id);
const marked = (el) =>
  Object.fromEntries(
    cards(el)
      .filter((g) => g.hasClass('thoughtknot-query-marked'))
      .map((g) => [g.getAttribute('data-item'), g.getAttribute('data-query-badge')]),
  );
const faded = (el) =>
  cards(el)
    .filter((g) => g.hasClass('thoughtknot-dim'))
    .map((g) => g.getAttribute('data-item'));
const hidden = (el) =>
  cards(el)
    .filter((g) => g.hasClass('thoughtknot-hidden'))
    .map((g) => g.getAttribute('data-item'));
const boxOf = (g) => {
  const r = g.querySelector('rect');
  return ['x', 'y', 'width', 'height'].map((n) => r.getAttribute(n)).join(',');
};
const banner = (el) => boardOf(el).querySelector('.thoughtknot-board-queries-said').textContent;
const pick = (select, value) => {
  select.value = value;
  select.dispatch('change');
};

/** The note's board drawn, its Filter panel opened. */
async function opened(env, note = NOTE) {
  const { el } = await show(env, note, 0);
  labelled(boardOf(el), 'Filter by kind or link').click();
  await until(() => panelOf(el));
  return el;
}

/** Sends the open send dialog's ask, answered by `reply`. */
async function send(env, reply) {
  await until(() => !!dialog(env));
  const m = dialog(env);
  inDialog(m, 'Show what will be sent').click();
  await until(() => m.contentEl.querySelector('.thoughtknot-ai-body'));
  env.state.reply = reply;
  inDialog(m, 'Send').click();
}

/** Writes `words` in the board's ask box, presses Ask AI and answers `body`. */
async function ask(env, el, words, body) {
  panelOf(el).querySelector('[name="filter-ask"]').value = words;
  const before = env.state.modals.length;
  labelled(panelOf(el), 'Ask AI').click();
  await until(() => env.state.modals.length > before);
  return send(env, typeof body === 'function' ? body : answer(body));
}

// proves: ai_query_highlight
// proves: ai_query_sends_ruled
test('on a board Ask AI is sent through the dialog and recorded; a highlight marks the linked cards and moves none', async () => {
  const env = await load({ files: { [PATH]: NOTE }, ...ON });
  try {
    const el = await opened(env);
    const before = Object.fromEntries(cards(el).map((g) => [g.getAttribute('data-item'), boxOf(g)]));
    await ask(env, el, 'late tasks', LATE);
    await until(() => items(el).length === 1);
    await until(() => env.state.data.aiSends?.length === 1, 'the send is recorded');
    assert.equal(env.state.requests.length, 1, 'sent once');
    pick(items(el)[0].querySelector('select[name="query-show"]'), 'highlight');
    labelled(panelOf(el), 'Show these').click();
    await until(() => Object.keys(marked(el)).length === 2);
    assert.deepEqual(marked(el), { a: '⚑', c: '⚑' }, 'the cards of the things it finds, each with a badge');
    assert.equal(card(el, 'a').querySelectorAll('.thoughtknot-query-ring').length, 3, 'and a ring round it');
    assert.match(card(el, 'a').querySelector('title').textContent, /Flag mark/, 'said in words as well');
    assert.deepEqual(faded(el), [], 'a highlight fades nothing');
    assert.deepEqual(hidden(el), [], 'and hides nothing');
    assert.match(banner(el), /Highlighting 2 things: late tasks/);
    for (const g of cards(el)) assert.equal(boxOf(g), before[g.getAttribute('data-item')], 'nothing moved');
    assert.equal(env.state.files.get(PATH), NOTE, 'the note is untouched');
    // a write to the note draws the board afresh: what is shown is shown still, until Show all
    const { el: again } = await show(env, NOTE, 0);
    await until(() => Object.keys(marked(again)).length === 2, 'drawn again, still marked');
    assert.match(banner(again), /Highlighting 2 things: late tasks/);
    labelled(boardOf(again).querySelector('.thoughtknot-board-queries-bar'), 'Show all').click();
    await until(() => Object.keys(marked(again)).length === 0, 'Show all takes the marks away');
  } finally {
    env.uninstall();
  }
});

// proves: ai_query_fails_open
test('on a board on a graph the note no longer has, Filter says so and stays closed', async () => {
  const gone = `---\nclassification: Public\n---\n# Work\n\n${fence(BOARD)}\n`;
  const env = await load({ files: { [PATH]: gone }, ...ON });
  try {
    const { el } = await show(env, gone, 0);
    const filter = labelled(boardOf(el), 'Filter by kind or link');
    filter.click();
    await until(() => /no longer has/.test(banner(el)), 'it says why');
    assert.equal(filter.getAttribute('aria-expanded'), 'false', 'and stays closed');
    assert.equal(panelOf(el), null, 'with no panel');
    assert.equal(env.state.requests.length, 0);
  } finally {
    env.uninstall();
  }
});

// proves: ai_query_highlight
// proves: ai_query_lock
test('on a board a filter fades the cards it does not keep, or hides them; a locked query refuses a new ask', async () => {
  const env = await load({ files: { [PATH]: NOTE }, ...ON });
  try {
    const el = await opened(env);
    await ask(env, el, 'late tasks', LATE);
    await until(() => items(el).length === 1);
    labelled(panelOf(el), 'Show these').click();
    await until(() => faded(el).length === 1);
    assert.deepEqual(faded(el), ['b'], 'the card of the thing it does not keep fades');
    assert.ok(!card(el, 'd').hasClass('thoughtknot-dim'), 'a card on no thing is left as it is');
    const hide = panelOf(el).querySelector('.thoughtknot-filter-ask-hide input');
    hide.checked = true;
    hide.dispatch('change');
    await until(() => hidden(el).length === 1);
    assert.deepEqual(hidden(el), ['b'], 'or is hidden');
    labelled(items(el)[0], 'Lock this query').click();
    assert.match(itemText(items(el)[0]), /🔒/, 'a lock mark');
    panelOf(el).querySelector('[name="filter-ask"]').value = 'all tasks';
    const sends = env.state.modals.length;
    labelled(panelOf(el), 'Ask AI').click();
    assert.match(said(el), /locked/);
    assert.equal(env.state.modals.length, sends, 'nothing is sent while locked');
    labelled(boardOf(el).querySelector('.thoughtknot-board-queries-bar'), 'Show all').click();
    await until(() => hidden(el).length === 0);
    assert.equal(env.state.files.get(PATH), NOTE);
  } finally {
    env.uninstall();
  }
});

// proves: ai_query_merge
test('on a board two queries merged as any of them mark each card with each part’s badge, named in a legend', async () => {
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
    labelled(panelOf(el), 'Merge the chosen').click();
    labelled(panelOf(el), 'Show these').click();
    pick(items(el)[2].querySelector('select[name="query-join"]'), 'any');
    pick(items(el)[2].querySelector('select[name="query-show"]'), 'highlight');
    await until(() => Object.keys(marked(el)).length === 3);
    assert.deepEqual(marked(el), { a: '⚑', b: '★', c: '⚑★' }, 'a card both find has both badges');
    const legend = boardOf(el).querySelectorAll('.thoughtknot-board-queries-bar .thoughtknot-query-legend li');
    assert.deepEqual(
      legend.map((li) => li.textContent),
      ['⚑late tasks', '★tasks Ana owns'],
      'the legend names each mark',
    );
  } finally {
    env.uninstall();
  }
});

// proves: ai_query_saved
// proves: ai_query_replay
test('on a board a saved query opens with nothing sent and marks its cards; Ask again sends only after a yes', async () => {
  const env = await load({ files: { [PATH]: SAVED }, ...ON });
  try {
    const el = await opened(env, SAVED);
    const saved = () => panelOf(el).querySelector('[data-saved="Late"]');
    await until(() => saved());
    labelled(saved(), 'Open').click();
    await until(() => items(el).length === 1);
    labelled(panelOf(el), 'Show these').click();
    await until(() => Object.keys(marked(el)).length === 2);
    assert.deepEqual(marked(el), { a: '⚑', c: '⚑' }, 'opened as it was saved, a highlight');
    assert.equal(env.state.requests.length, 0, 'opening sends nothing');
    labelled(saved(), 'Ask again').click();
    await until(() => !!dialog(env));
    assert.match(dialog(env).contentEl.textContent, /1\. late tasks/, 'the prompts shown first');
    byText(dialog(env), 'Cancel').click();
    await until(() => /Nothing was sent\./.test(said(el)));
    assert.equal(env.state.requests.length, 0, 'a no sends nothing');
    labelled(saved(), 'Ask again').click();
    await until(() => !!dialog(env));
    byText(dialog(env), 'Go ahead').click();
    await send(env, answer(LATE));
    await until(() => /Filled in from your words/.test(said(el)), 'its answer fills the query again');
    assert.equal(env.state.requests.length, 1, 'its one prompt sent once');
    await until(() => env.state.data.aiSends?.length === 1, 'and recorded');
    assert.equal(env.state.files.get(PATH), SAVED, 'the note is untouched');
  } finally {
    env.plugin.onunload();
    env.uninstall();
  }
});

// proves: ai_query_fails_open
test('on a board a send that fails says why, keeps the words, and leaves every card as it was', async () => {
  const env = await load({ files: { [PATH]: NOTE }, ...ON });
  try {
    const el = await opened(env);
    await ask(env, el, 'tasks Sam owns', async () => ({ status: 500, text: 'down' }));
    await until(() => /refused the request/.test(said(el)));
    assert.match(said(el), /your words are kept to try again/);
    assert.equal(panelOf(el).querySelector('[name="filter-ask"]').value, 'tasks Sam owns');
    assert.deepEqual(faded(el), []);
    assert.deepEqual(hidden(el), []);
    assert.deepEqual(marked(el), {});
  } finally {
    env.uninstall();
  }
});

// proves: ai_query_replay
test('with AI off a board offers no Ask AI, and says in words why a saved query has no Ask again', async () => {
  const env = await load({ files: { [PATH]: SAVED } });
  try {
    const el = await opened(env, SAVED);
    await until(() => panelOf(el).querySelector('[data-saved="Late"]'));
    assert.equal(panelOf(el).querySelector('[name="filter-ask"]'), null, 'no box to ask an AI in');
    assert.equal(labelled(panelOf(el).querySelector('[data-saved="Late"]'), 'Ask again'), undefined);
    assert.match(
      panelOf(el).querySelector('.thoughtknot-saved-queries-no-again').textContent,
      /Ask again is not offered/,
      'its absence is said, never just missing',
    );
    labelled(panelOf(el).querySelector('[data-saved="Late"]'), 'Open').click();
    await until(() => items(el).length === 1);
    labelled(panelOf(el), 'Show these').click();
    await until(() => Object.keys(marked(el)).length === 2);
    assert.equal(env.state.requests.length, 0);
  } finally {
    env.plugin.onunload();
    env.uninstall();
  }
});
