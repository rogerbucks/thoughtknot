// Text to graph from Obsidian (spec §47, text_to_graph_in_editor). The command takes the selection, or the note's own
// words, through the send dialog. It is offered only while AI is on, keeps within the ceiling, is shown before Send and
// is recorded. The fake host never reaches the network.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';

before(() => build());

const PATH = 'Team.md';
const PROSE = 'Acme Ltd hired Alice Smith. She runs the Berlin office.';
const NOTE = `---\nclassification: Public\n---\n# Team\n\n${PROSE}\n`;
const GRAPH = "// graph: team\n(acme:Company {name: 'Acme', aliases: 'Acme Ltd'})";
const WITH_GRAPH = `${NOTE}\n\`\`\`gql\n${GRAPH}\n\`\`\`\n`;
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
    { name: 'acme', kind: 'Company', text: 'Acme Ltd', quote: 'Acme Ltd' },
    { name: 'alice', kind: 'Employee', text: 'Alice Smith', quote: 'Alice Smith' },
  ],
  links: [{ from: 'acme', type: 'HIRED', to: 'alice', quote: 'hired Alice Smith' }],
};
const answer = (body) => async () => ({
  status: 200,
  text: JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }),
});

async function open(note, data = ON, selection = '') {
  const env = await load({ files: { [PATH]: note }, data });
  env.state.activeView = new env.obsidian.MarkdownView(env.app.vault.getAbstractFileByPath(PATH), note, 'source');
  env.state.activeView.selection = selection;
  return env;
}
const command = (env) => env.state.commands.find((c) => c.id === 'text-to-graph-ai');
const dialog = (env) => env.state.modals.at(-1);
const button = (m, label) => m.contentEl.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);
const shownBody = (m) => m.contentEl.querySelector('.thoughtknot-ai-body')?.textContent ?? null;
function choose(m, name, value) {
  const row = m.contentEl
    .querySelectorAll('.setting-item')
    .find((r) => r.querySelector('.setting-item-name')?.textContent === name);
  const sel = row.querySelector('select');
  sel.value = value;
  sel.dispatch('change');
}

// text_to_graph_in_editor
test('the action is absent while AI is off, keeps to the ceiling, shows what will be sent, and records the send', async () => {
  // AI off: the command is not offered
  const off = await open(NOTE, { settings: { aiModels: [LOCAL] } });
  try {
    assert.equal(command(off).checkCallback(true), false);
  } finally {
    off.uninstall();
  }
  const env = await open(NOTE);
  try {
    assert.equal(command(env).checkCallback(true), true);
    command(env).checkCallback(false);
    await until(() => env.state.modals.length);
    const m = dialog(env);
    choose(m, 'Model', 'Local');
    button(m, 'Show what will be sent').click();
    const body = shownBody(m);
    assert.ok(body, m.contentEl.textContent);
    // the note's own words, without its front matter, go in a fence of their own, with the library's instructions
    assert.match(body, /source-text\\n# Team\\n\\nAcme Ltd hired Alice Smith/);
    assert.doesNotMatch(body, /classification: Public/);
    assert.match(body, /You make a graph, written in GQL in a note/);
    env.state.reply = answer(ANSWER);
    button(m, 'Send').click();
    // no graph in the note yet: a review of what to keep opens, and nothing is written until it says so
    await until(() => env.state.modals.some((x) => x.titleEl?.textContent?.includes('Keep what the AI found')));
    assert.equal(env.state.files.get(PATH), NOTE);
    const [record] = env.state.data.aiSends;
    assert.equal(record.outcome, 'answered');
    assert.equal(record.digest.length, 64);
    const review = env.state.modals.at(-1);
    button(review, 'Write the ticked ones').click();
    await until(() => env.state.files.get(PATH).includes('// graph: team'));
    const written = env.state.files.get(PATH);
    assert.ok(written.startsWith(NOTE), 'the text is kept');
    assert.match(written, /\(alice:Employee \{name: 'Alice Smith'\}\)/);
    assert.match(written, /\(acme\)-\[:HIRED\]->\(alice\)/);
  } finally {
    env.uninstall();
  }
});

test('on a selection in a note that holds the graph, the answer is a change set beside it, the graph unchanged', async () => {
  const env = await open(WITH_GRAPH, ON, 'Acme Ltd hired Alice Smith.');
  try {
    command(env).checkCallback(false);
    await until(() => env.state.modals.length);
    const m = dialog(env);
    choose(m, 'Model', 'Local');
    button(m, 'Show what will be sent').click();
    const body = shownBody(m);
    assert.match(body, /source-text\\nAcme Ltd hired Alice Smith\.\\n/);
    assert.doesNotMatch(body, /Berlin/, 'only the selection is sent');
    env.state.reply = answer(ANSWER);
    button(m, 'Send').click();
    await until(() => env.state.files.get(PATH).includes('CHANGE SET'));
    const note = env.state.files.get(PATH);
    assert.ok(note.startsWith(WITH_GRAPH), 'the graph is as it was');
    // acme is matched by its alias and never added again
    assert.doesNotMatch(note.slice(WITH_GRAPH.length), /\(acme:Company/);
    assert.match(note, /\(alice:Employee/);
  } finally {
    env.uninstall();
  }
});

test('a note above the model’s ceiling is refused, and nothing is sent', async () => {
  const secret = NOTE.replace('classification: Public', 'classification: Secret');
  const env = await open(secret);
  try {
    command(env).checkCallback(false);
    await until(() => env.state.modals.length);
    const m = dialog(env);
    choose(m, 'Model', 'Local');
    button(m, 'Show what will be sent').click();
    assert.equal(shownBody(m), null);
    assert.ok(m.contentEl.querySelector('.thoughtknot-ai-refused'), m.contentEl.textContent);
    assert.equal(env.state.data?.aiSends?.length ?? 0, 0);
  } finally {
    env.uninstall();
  }
});
