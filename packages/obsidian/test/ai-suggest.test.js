// Asking an AI model for suggestions from Obsidian (spec §59, ai_suggest_values, ai_suggest_on_ask). The send dialog
// asks for a value of one property, or for each thing's pull on an intent. The answer is written as a change set,
// grouped by value, for a person to apply a group at a time. The fake host never reaches the network.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';

before(() => build());

const PATH = 'Work.md';
const GRAPH = [
  '// graph: work',
  "(ship:Intent {says: 'Ship by Friday'}),",
  "(login:Task {name: 'Fix the login page'}),",
  "(docs:Task {name: 'Write the help pages'})",
].join('\n');
const NOTE = `---\nclassification: Public\n---\n# Work\n\n\`\`\`gql\n${GRAPH}\n\`\`\`\n`;
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

async function open() {
  const env = await load({ files: { [PATH]: NOTE }, ...ON });
  env.state.activeView = new env.obsidian.MarkdownView(env.app.vault.getAbstractFileByPath(PATH), NOTE, 'source');
  return env;
}
const dialog = (env) => env.state.modals.at(-1);
const row = (m, name) =>
  m.contentEl
    .querySelectorAll('.setting-item')
    .find((r) => r.querySelector('.setting-item-name')?.textContent === name);
const button = (m, label) => m.contentEl.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);
const shownBody = (m) => m.contentEl.querySelector('.thoughtknot-ai-body')?.textContent ?? null;
function choose(m, name, value) {
  const sel = row(m, name).querySelector('select');
  sel.value = value;
  sel.dispatch('change');
}
function type(m, name, value) {
  const field = row(m, name).querySelector('input');
  field.value = value;
  field.dispatch('input');
}

// ai_suggest_values
test('the dialog asks for suggested values, and the answer is written as a change set grouped by value', async () => {
  const env = await open();
  try {
    await env.state.commands.find((c) => c.id === 'ask-ai-model').callback();
    const m = dialog(env);
    choose(m, 'Ask for', 'values');
    type(m, 'Property', 'category');
    type(m, 'Of kind', 'Task');
    type(m, 'Values to choose from', 'bug, docs');
    choose(m, 'Model', 'Local');
    button(m, 'Show what will be sent').click();
    const body = shownBody(m);
    assert.ok(body, m.contentEl.textContent);
    assert.match(body, /Suggest a value of the property \\"category\\" for each thing of kind Task/);
    assert.match(body, /only one of: \\"bug\\", \\"docs\\"/);
    env.state.reply = answer({
      suggestions: [
        { thing: 'login', value: 'bug', certainty: 'likely', reason: 'a broken page', read: ['login'] },
        { thing: 'docs', value: 'docs', certainty: 'very-likely', reason: 'help pages', read: ['docs'] },
      ],
    });
    button(m, 'Send').click();
    await until(() => env.state.files.get(PATH).includes('CHANGE SET'));
    const note = env.state.files.get(PATH);
    assert.ok(note.startsWith(NOTE), 'the graph is as it was');
    assert.match(note, /\/\/@ group: category 'bug'/);
    assert.match(note, /\/\/@ reason: likely \(55–80%\), read login: a broken page/);
  } finally {
    env.uninstall();
  }
});

// ai_suggest_on_ask
test('asking about an intent offers the graph’s intents, and an empty ask sends nothing', async () => {
  const env = await open();
  try {
    await env.state.commands.find((c) => c.id === 'ask-ai-model').callback();
    const m = dialog(env);
    choose(m, 'Ask for', 'intent');
    assert.equal(row(m, 'Intent').querySelector('select').value, 'ship');
    choose(m, 'Model', 'Local');
    const field = row(m, 'Your question').querySelector('textarea');
    field.value = '  ';
    field.dispatch('input');
    button(m, 'Show what will be sent').click();
    assert.equal(shownBody(m), null);
    assert.match(m.contentEl.textContent, /nothing is suggested unasked/);
    assert.ok(button(m, 'Send').disabled);
    assert.deepEqual(env.state.requests, []);
  } finally {
    env.uninstall();
  }
});

// ai_levels
test('asking your AI to name the levels saves them in the AI block, never the graph, with an Undo on its toast', async () => {
  const env = await open();
  try {
    await env.state.commands.find((c) => c.id === 'ask-ai-model').callback();
    const m = dialog(env);
    choose(m, 'Ask for', 'levels');
    choose(m, 'Model', 'Local');
    const field = row(m, 'Your question').querySelector('textarea');
    field.value = 'Name the levels';
    field.dispatch('input');
    button(m, 'Show what will be sent').click();
    assert.match(shownBody(m) ?? '', /You name the levels of detail/);
    env.state.reply = answer({
      suggestions: [{ thing: 'login', subject: 'Product', area: 'Login', certainty: 'likely', read: ['login'] }],
    });
    button(m, 'Send').click();
    await until(() => env.state.files.get(PATH).includes('AI ON work'));
    const note = env.state.files.get(PATH);
    assert.ok(note.startsWith(NOTE.trimEnd()), 'the graph is as it was');
    assert.match(note, /\/\/ graph: work_ai · AI ON work/);
    assert.match(note, /reviewer: 'public'/, 'the block says which reviewer ran: one not marked private is public');
    assert.match(note, /subject: 'Product'/);
    assert.doesNotMatch(note, /CHANGE SET/);
    assert.ok(env.state.noticeEls.at(-1).querySelector('button'), 'the toast offers Undo');
  } finally {
    env.uninstall();
  }
});
