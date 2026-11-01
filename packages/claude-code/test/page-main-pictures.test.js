// The picture for readers on the browser editor's page (editor spec §62, picture_hidden_when_drawn). The page is the one
// VS Code's tab and the desktop app run too. It draws the note's graph beside its prose. So the image line after a
// block it draws is left out of the prose, and the graph shows once. A line after a block it does not draw stays. Its
// bar says whether the picture is up to date, as the server reads it. The page runs as built, in a DOM, against the
// real server.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { pictureFingerprint, pictureTexts } from '@thoughtknot/core';
import { until } from '../../obsidian/test/host/load-plugin.js';
import { cleanUp } from './editor-page-support.js';
import { NOTE_PATH, livePage } from './editor-page-live.js';

after(cleanUp);

const NOTE = [
  '# Reading',
  '```gql',
  '// graph: reader',
  "(question:Question {title: 'Which reader?'}),",
  "(tablet:Option {name: 'Tablet'}),",
  '(tablet)-[:ANSWERS]->(question)',
  '```',
  '![Drawn graph picture](Note.reader.thoughtknot.svg)',
  'Some prose.',
  '```gql',
  '// graph: reader_look · STYLE ON reader',
  '```',
  '![Style picture](Note.reader_look.thoughtknot.svg)',
  '',
].join('\n');

describe('the picture for readers on the browser editor’s page', () => {
  // proves: picture_hidden_when_drawn
  test('leaves out the image line after a block it draws, and keeps one after any other', async () => {
    const page = await livePage(NOTE);
    try {
      await page.ready();
      const prose = () => page.doc.querySelector('.gn-prose')?.textContent ?? '';
      await until(() => prose().includes('Some prose.'), 8000);
      assert.doesNotMatch(prose(), /Drawn graph picture/, 'the drawn graph shows once');
      assert.match(prose(), /Style picture/, 'a line after a block the page does not draw stays');
    } finally {
      await page.stop();
    }
  });

  // proves: picture_hidden_when_drawn
  test('its bar says whether the picture is up to date, by the mark in the picture', async () => {
    const fingerprint = pictureFingerprint(NOTE_PATH, pictureTexts(NOTE, 'reader'));
    const picture = `<svg xmlns="http://www.w3.org/2000/svg"><metadata>thoughtknot reader picture ${fingerprint}</metadata></svg>`;
    const page = await livePage(NOTE, { files: { 'Note.reader.thoughtknot.svg': picture } });
    try {
      await page.ready();
      const said = () => page.doc.querySelector('.gn-pane .thoughtknot-badge')?.getAttribute('aria-label') ?? '';
      await until(() => said().includes('picture'), 8000);
      assert.match(said(), /picture up to date/);
    } finally {
      await page.stop();
    }
  });
});
