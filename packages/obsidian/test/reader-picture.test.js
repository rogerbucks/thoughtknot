// The pictures for readers without ThoughtKnot in Obsidian (editor spec §62). None until turned on, by a command for a
// note or by a folder in the settings. Each is a file named after the note and the graph, where Obsidian keeps
// attachments, linked by one image line after its block. It is kept in step with the text, follows its note when
// renamed, goes with its block, and a file ThoughtKnot did not make is never touched. Turning it off asks first.
// Where the plugin draws the block, the line is hidden so the graph shows once.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { cmState } from './host/fake-obsidian.js';
import { build, load, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';

before(() => build());

const PATH = 'Work/People.md';
const DATA = `// graph: people
(alice:Person {name: 'Alice'}),
(bob:Person {name: 'Bob'}),
(alice)-[:KNOWS]->(bob)`;
const NOTE = ['# People', '', fence(DATA), 'Some text.', ''].join('\n');
const PICTURE = 'attachments/People.people.thoughtknot.svg';
const LINK = '../attachments/People.people.thoughtknot.svg';

const svgs = (env) => [...env.state.files.keys()].filter((p) => p.endsWith('.svg'));
const note = (env, path = PATH) => env.state.files.get(path);
const command = (env, id) => env.state.commands.find((c) => c.id === id).callback();
/** How often the note's pictures have been brought up to date since the plugin loaded. */
const keptCount = (env) => (env.state.triggered ?? []).filter(([name]) => name === 'thoughtknot:pictures-kept').length;
/** Waits until the note's pictures have been brought up to date `n` times. */
const kept = (env, n = 1) => until(() => keptCount(env) >= n, 8000);
const modal = (env) => env.state.modals.at(-1);
const button = (m, text) => m.contentEl.querySelectorAll('button').find((b) => b.textContent === text);

async function loaded(files = { [PATH]: NOTE }, settings = {}) {
  const env = await load({ files, data: { settings } });
  env.state.activeView = new env.obsidian.MarkdownView(env.app.vault.getAbstractFileByPath(PATH), NOTE, 'source');
  return env;
}

/** Turns the pictures on for the note in front, and waits for its line. */
async function turnedOn(env) {
  command(env, 'pictures-on');
  await until(() => (note(env) ?? '').includes('.thoughtknot.svg'), 8000);
}

describe('pictures for readers in Obsidian', () => {
  // proves: picture_opt_in
  test('are made only once turned on for the note, and turning them off asks, then takes away line and file', async () => {
    const env = await loaded();
    try {
      await env.app.vault.modify(env.app.vault.getAbstractFileByPath(PATH), NOTE.replace("'Bob'", "'Bobby'"));
      await kept(env);
      assert.deepEqual(svgs(env), [], 'none before it is turned on');
      await turnedOn(env);
      assert.deepEqual(svgs(env), [PICTURE]);
      command(env, 'pictures-off');
      assert.match(modal(env).contentEl.textContent, /Remove the picture line after each graph in Work\/People\.md/);
      assert.ok(note(env).includes(LINK), 'nothing taken until the answer');
      button(modal(env), 'Remove').click();
      await until(() => !note(env).includes('.thoughtknot.svg'));
      await until(() => svgs(env).length === 0);
      assert.deepEqual(env.state.trashed, [PICTURE], 'to the trash, as the person set it');
    } finally {
      env.uninstall();
    }
  });

  // proves: picture_for_readers, picture_where
  test('land where Obsidian keeps attachments, named after the note and the graph, linked by one line after the block', async () => {
    const env = await loaded();
    try {
      await turnedOn(env);
      const lines = note(env).split('\n');
      assert.equal(lines[lines.indexOf('```', 3) + 1].replace(/^!\[[^\]]*\]/, ''), `(${LINK})`);
      assert.match(lines[lines.indexOf('```', 3) + 1], /^!\[Graph people: 2 things, 1 link\./);
      assert.match(env.state.files.get(PICTURE), /^<svg[\s\S]*Drawn by ThoughtKnot from Work\/People\.md/);
    } finally {
      env.uninstall();
    }
  });

  // proves: picture_opt_in, picture_where
  test('are on for each note in a folder the settings name, in the picture folder set', async () => {
    const env = await loaded({ [PATH]: NOTE }, { pictureFolders: 'Work', pictureFolder: 'Pictures' });
    try {
      await env.app.vault.modify(env.app.vault.getAbstractFileByPath(PATH), NOTE);
      await until(() => svgs(env).length === 1, 8000);
      assert.deepEqual(svgs(env), ['Pictures/People.people.thoughtknot.svg']);
      await until(() => note(env).includes('](../Pictures/People.people.thoughtknot.svg)'));
    } finally {
      env.uninstall();
    }
  });

  // proves: picture_kept_in_step
  test('are redrawn by an edit, and an edit that leaves the graph as it was writes no picture', async () => {
    const env = await loaded();
    try {
      await turnedOn(env);
      const file = () => env.app.vault.getAbstractFileByPath(PATH);
      env.state.writes = [];
      const before = keptCount(env);
      await env.app.vault.modify(file(), note(env).replace('Some text.', 'Other text.'));
      await kept(env, before + 1);
      assert.ok(!env.state.writes.includes(PICTURE), 'the graph unchanged: no file written');
      await env.app.vault.modify(file(), note(env).replace("'Bob'", "'Robert'"));
      await until(() => env.state.files.get(PICTURE).includes('Robert'), 8000);
    } finally {
      env.uninstall();
    }
  });

  // proves: picture_where
  test('follow a renamed note, go with their block, and never touch a file ThoughtKnot did not make', async () => {
    const env = await loaded();
    try {
      await turnedOn(env);
      const f = env.app.vault.getAbstractFileByPath(PATH);
      await env.app.vault.rename(f, 'Work/Friends.md');
      await until(() => env.state.files.has('attachments/Friends.people.thoughtknot.svg'), 8000);
      await until(() => (note(env, 'Work/Friends.md') ?? '').includes('Friends.people.thoughtknot.svg)'));
      assert.ok(!env.state.files.has(PICTURE), 'renamed, not copied');
      await until(() => env.state.files.get('attachments/Friends.people.thoughtknot.svg').includes('Work/Friends.md'));
      // the block taken away: its picture goes, line and file
      const now = env.app.vault.getAbstractFileByPath('Work/Friends.md');
      await env.app.vault.modify(now, note(env, 'Work/Friends.md').replace(fence(DATA), ''));
      await until(() => !note(env, 'Work/Friends.md').includes('.thoughtknot.svg'), 8000);
      assert.deepEqual(svgs(env), []);
    } finally {
      env.uninstall();
    }
    const mine = await loaded({ [PATH]: NOTE, [PICTURE]: '<svg>my own drawing</svg>' });
    try {
      await turnedOn(mine);
      assert.equal(mine.state.files.get(PICTURE), '<svg>my own drawing</svg>', 'a file not ThoughtKnot’s is kept');
      assert.ok(mine.state.files.has('attachments/People.people 1.thoughtknot.svg'), 'its picture goes beside it');
    } finally {
      mine.uninstall();
    }
  });

  // proves: picture_hidden_when_drawn
  test('are hidden after a block the plugin draws, in reading view and Live Preview, and shown after any other', async () => {
    const env = await loaded();
    try {
      await turnedOn(env);
      const text = note(env);
      const at = text.split('\n').findIndex((l) => l.includes('.thoughtknot.svg'));
      const section = (lineStart) => {
        const el = env.doc.body.createDiv();
        el.createEl('img', { attr: { src: `app://vault/attachments/People.people.thoughtknot.svg` } });
        for (const fn of env.state.postProcessors)
          fn(el, { getSectionInfo: () => ({ text, lineStart, lineEnd: lineStart }) });
        return el.querySelector('img').classList.contains('thoughtknot-picture-hidden');
      };
      assert.equal(section(at), true, 'reading view: hidden after a drawn block');
      assert.equal(section(at + 1), false, 'not on another line');
      const styled = text.replace('// graph: people', '// graph: people_look · STYLE ON people');
      const el = env.doc.body.createDiv();
      el.createEl('img', { attr: { src: 'app://vault/attachments/People.people.thoughtknot.svg' } });
      for (const fn of env.state.postProcessors)
        fn(el, { getSectionInfo: () => ({ text: styled, lineStart: at, lineEnd: at }) });
      assert.equal(
        el.querySelector('img').classList.contains('thoughtknot-picture-hidden'),
        false,
        'after a style block, shown',
      );
      // Live Preview: the line marked, so the stylesheet hides its picture
      const state = cmState.EditorState.create({
        doc: text,
        extensions: env.state.editorExtensions.filter((e) => !e?.listener),
      });
      const field = env.state.editorExtensions.find((e) => e && typeof e === 'object' && 'createF' in e);
      const marks = field ? state.field(field) : null;
      const lines = [];
      marks?.between(
        0,
        state.doc.length,
        (from, _to, d) => void lines.push([state.doc.lineAt(from).number - 1, d.spec.class]),
      );
      assert.deepEqual(lines, [[at, 'thoughtknot-picture-hidden']]);
    } finally {
      env.uninstall();
    }
  });
});
