// The app's first page speaks the system's language (editor spec §42, language_follows_host). The window says the
// system's language, as the browser editor's page takes it from the browser. The words, the page's language and its
// direction follow it. A language with no translation file is said in UK English.
// On a phone or tablet (spec §40, android_app and ios_app) there is no folder dialog. The app keeps its notes in its own
// folder, open from the start. The first page lists them with nothing to pick. Its button makes a new note, never over
// one already there, and opens it in the editor.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { PSEUDO_LANGUAGES, isPseudoWord } from '@thoughtknot/core';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { cleanUpApp, emptyFolder, fakeInvoke, openAppStart } from './app-window.js';
import { PRIVACY_PAGE, editorAddress, newNoteText, startApp } from '../src/app-start.ts';
import { until } from '../../obsidian/test/host/load-plugin.js';

after(cleanUpApp);

/** The first page with no folder picked, in `language`: its button's words, and the page's language and direction. */
async function firstPage(language) {
  const page = await openAppStart(null, language);
  try {
    await until(() => page.doc.querySelector('#gn-app button'), 8000);
    const root = page.doc.documentElement;
    return { button: page.doc.querySelector('#gn-app button').textContent, lang: root.lang, dir: root.dir };
  } finally {
    await page.stop();
  }
}

test('the first page is in the system’s language, read in its direction', async () => {
  for (const language of Object.keys(PSEUDO_LANGUAGES)) {
    const seen = await firstPage(language);
    assert.ok(isPseudoWord(seen.button), `${language}: the button says "${seen.button}"`);
    assert.equal(seen.lang, language);
    assert.equal(seen.dir, language === 'ar-XB' ? 'rtl' : 'ltr');
  }
});

test('a system language with no translation file is said in UK English', async () => {
  assert.deepEqual(await firstPage('en-US'), { button: 'Open a folder of notes', lang: 'en-GB', dir: 'ltr' });
});

test('the first page names the privacy page, where the site publishes it (LEGAL-2)', async () => {
  assert.equal(PRIVACY_PAGE, 'https://thoughtknot.app/privacy.html');
  const page = await openAppStart(null);
  try {
    await until(() => page.doc.querySelector('.gn-app-privacy'), 8000);
    assert.match(page.doc.querySelector('.gn-app-privacy').textContent, /keeps no data about you\. .*privacy\.html$/);
  } finally {
    await page.stop();
  }
});

/** The first page over `folder`, as the app shows it on a phone: `{ doc, opened }`, `opened` the addresses it went to. */
async function phonePage(folder) {
  const { window } = new JSDOM('<!doctype html><body><main id="gn-app"></main></body>');
  const opened = [];
  await startApp(window.document, fakeInvoke(folder, null, 'Documents'), (address) => opened.push(address));
  return { doc: window.document, opened };
}

const button = (doc) => doc.querySelector('#gn-app button');

test("on a phone the first page lists the app's own notes, with no folder to pick", async () => {
  const folder = emptyFolder();
  writeFileSync(join(folder, 'Reader.md'), '# Reader\n');
  const { doc } = await phonePage(folder);
  assert.deepEqual(
    [...doc.querySelectorAll('#gn-app li a')].map((a) => a.getAttribute('href')),
    [editorAddress('Reader.md')],
  );
  assert.equal(doc.querySelectorAll('#gn-app button').length, 1, 'one button, and it is not the folder picker');
  assert.equal(button(doc).textContent, 'New note');
});

test('on a phone with no notes yet, the page says how to start one', async () => {
  const { doc } = await phonePage(emptyFolder());
  assert.match(doc.querySelector('#gn-app p').textContent, /No notes yet\. Make one here/);
});

test('New note makes a note with an empty graph and opens it, never over a note already there', async () => {
  const folder = emptyFolder();
  writeFileSync(join(folder, 'New note.md'), 'mine\n');
  const { doc, opened } = await phonePage(folder);
  button(doc).click();
  for (let i = 0; i < 100 && !opened.length; i++) await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(opened, [editorAddress('New note-2.md')]);
  assert.equal(readFileSync(join(folder, 'New note.md'), 'utf8'), 'mine\n', 'the note there is left as it was');
  assert.equal(readFileSync(join(folder, 'New note-2.md'), 'utf8'), newNoteText('New note'));
  assert.match(newNoteText('New note'), /```gql\n\/\/ graph: first\n```/, 'an empty graph block, to start from');
  assert.deepEqual(readdirSync(folder).sort(), ['New note-2.md', 'New note.md']);
});

test('on a computer the first page still asks for a folder', async () => {
  const { window } = new JSDOM('<!doctype html><body><main id="gn-app"></main></body>');
  await startApp(window.document, async () => Promise.reject('no folder is open'));
  assert.equal(button(window.document).textContent, 'Open a folder of notes');
});
