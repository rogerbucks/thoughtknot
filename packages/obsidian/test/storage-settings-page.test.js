// Where graphs are kept, on the settings page (ES§55, ST1). In Obsidian the place is this vault, said with its
// sentence (storage_defaults, Roger's D2). Keeping who changed what is opt in (storage_history_layer): off, nothing is
// written for it. Turned on, a change the plug-in makes is kept as a note in the folder chosen. It has the name on
// decisions, and the note itself is changed as before.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { page, row, set } from './host/profile-notes.js';
// The module's own functions are tested directly in storage-settings.test.js.

before(() => build());

const PATH = 'Slip.md';
const SLIP = "// graph: g\n(a:T {text: 'A'})\n(b:T {text: 'B'})";
const NOTE = `# Slip\n\n${fence(SLIP)}\n`;
const CONVERTED = NOTE.replace("(a:T {text: 'A'})\n", "(a:T {text: 'A'}),\n");

/** The plug-in, with the note open in Source mode in front, so Convert to standard GQL changes it. */
async function loaded(data) {
  const env = await load({ files: { [PATH]: NOTE }, data });
  env.state.active = PATH;
  const leaf = new env.obsidian.WorkspaceLeaf(env.app);
  leaf.view = new env.obsidian.MarkdownView(env.app.vault.getAbstractFileByPath(PATH), NOTE, 'source');
  env.app.workspace.leaves.push(leaf);
  env.state.activeView = leaf.view;
  return env;
}
const convert = (env) => env.state.commands.find((c) => c.id === 'convert-to-standard').callback();
const historyNotes = (env, folder = 'ThoughtKnot history') =>
  [...env.state.files.keys()].filter((p) => p.startsWith(`${folder}/`));

// proves: storage_defaults
test('the page says graphs are kept in this vault, and keeping who changed what is off', async () => {
  const env = await loaded();
  try {
    const el = page(env);
    assert.match(row(el, 'This vault').textContent, /kept where Obsidian keeps them/);
    assert.equal(row(el, 'Keep who changed what').querySelector('select').value, 'off');
    assert.ok(row(el, 'Folder for who changed what'));

    // off: the note changes, and nothing else is written
    await convert(env);
    assert.equal(env.state.files.get(PATH), CONVERTED);
    assert.deepEqual(historyNotes(env), []);
  } finally {
    env.uninstall();
  }
});

// proves: storage_history_layer
test('turned on, each change is kept as a note in the folder, with the name on decisions', async () => {
  const env = await loaded({ settings: { decider: 'Roger' } });
  try {
    await set(env, 'Keep who changed what', 'on');
    await set(env, 'Folder for who changed what', 'Changes');
    assert.deepEqual(env.state.data.storage, { history: 'on', historyFolder: 'Changes' });

    await convert(env);
    assert.equal(env.state.files.get(PATH), CONVERTED, 'the note is changed as before');
    const [kept, ...more] = historyNotes(env, 'Changes');
    assert.equal(more.length, 0, 'one note a day');
    const text = env.state.files.get(kept);
    const change = JSON.parse(text.split('\n')[text.split('\n').indexOf('```json thoughtknot-change') + 1]);
    assert.deepEqual(
      { path: change.path, before: change.before, after: change.after, author: change.author },
      { path: PATH, before: NOTE, after: CONVERTED, author: 'Roger' },
    );
  } finally {
    env.uninstall();
  }
});
