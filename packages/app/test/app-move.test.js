// Moving the notes to another folder in the desktop app (ES§55, storage_user_choice). The person picks the
// folder. Every note is copied there and read back before the app opens it. The old copies stay until the person
// presses Remove, and a note changed after the move is kept. A move that would write over other notes moves nothing.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { JSDOM } from 'jsdom';
import { cleanUpApp, emptyFolder, fakeInvoke } from './app-window.js';
import { startApp } from '../src/app-start.ts';
import { until } from '../../obsidian/test/host/load-plugin.js';

after(cleanUpApp);

const NOTES = { 'Ideas.md': '# Ideas\r\n\nüñï 😀\n', 'Work/Plan.md': '```gql\n// graph: plan\n```\n' };

/** A folder holding `notes`, by their paths. */
function folderWith(notes) {
  const dir = emptyFolder();
  for (const [path, text] of Object.entries(notes)) {
    mkdirSync(join(dir, ...path.split('/').slice(0, -1)), { recursive: true });
    writeFileSync(join(dir, ...path.split('/')), text);
  }
  return dir;
}

/** The notes in `dir`, by path, as the app lists them. */
const notesIn = (dir, prefix = '') =>
  Object.fromEntries(
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? Object.entries(notesIn(join(dir, e.name), `${prefix}${e.name}/`))
        : e.name.endsWith('.md')
          ? [[`${prefix}${e.name}`, readFileSync(join(dir, e.name), 'utf8')]]
          : [],
    ),
  );

/** The first page over `from`, whose move dialog gives `to`: `{ doc, press, said }`. */
async function appOn(from, to) {
  const { window } = new JSDOM('<!doctype html><body><main id="gn-app"></main></body>');
  const doc = window.document;
  await startApp(doc, fakeInvoke(from, null, null, to), () => {});
  const button = (name) => [...doc.querySelectorAll('#gn-app button')].find((b) => b.textContent === name);
  return {
    doc,
    button,
    press: async (name, then) => {
      button(name).click();
      await until(then, 8000);
    },
    said: () => doc.getElementById('gn-app').textContent,
  };
}

// proves: storage_user_choice
test('every note is copied and checked, the app opens the new folder, and the old copies go only when asked', async () => {
  const from = folderWith(NOTES),
    to = emptyFolder();
  const app = await appOn(from, to);
  await app.press('Move my notes to another folder', () => app.button('Remove the old copies'));

  assert.deepEqual(notesIn(to), NOTES, 'each note byte for byte in the new folder');
  assert.deepEqual(notesIn(from), NOTES, 'the old copies stay until the person says so');
  assert.match(app.doc.querySelector('#gn-app h2').textContent, new RegExp(`^${basename(to)}: 2 notes$`));
  assert.match(app.said(), /Your 2 notes are now in .*\. The old copies are still in the old folder\./);

  // a note changed in the old folder after the move is kept there
  writeFileSync(join(from, 'Ideas.md'), 'changed after the move');
  await app.press('Remove the old copies', () => /Removed 1 old copy/.test(app.said()));
  assert.deepEqual(notesIn(from), { 'Ideas.md': 'changed after the move' });
  assert.match(app.said(), /Kept in the old folder, as they changed after the move: Ideas\.md/);
  assert.deepEqual(notesIn(to), NOTES);
});

test('Keep them leaves the old copies where they are', async () => {
  const from = folderWith(NOTES),
    to = emptyFolder();
  const app = await appOn(from, to);
  await app.press('Move my notes to another folder', () => app.button('Keep them'));
  app.button('Keep them').click();
  assert.equal(app.button('Remove the old copies'), undefined);
  assert.deepEqual(notesIn(from), NOTES);
  assert.deepEqual(notesIn(to), NOTES);
});

test('a folder with other text at a note’s name moves nothing, and both folders stay as they were', async () => {
  const from = folderWith(NOTES),
    to = folderWith({ 'Ideas.md': 'theirs' });
  const app = await appOn(from, to);
  await app.press('Move my notes to another folder', () => /Nothing was moved/.test(app.said()));
  assert.match(app.said(), /already has other notes at these names: Ideas\.md\. Nothing was moved\./);
  assert.deepEqual(notesIn(to), { 'Ideas.md': 'theirs' });
  assert.deepEqual(notesIn(from), NOTES);
  assert.equal(existsSync(join(to, 'Work')), false, 'no folder is made there either');
});
