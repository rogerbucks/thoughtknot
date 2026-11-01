// A card drawn off the page, as Live Preview draws each card before it puts it there, fits its frame once it is placed
// (editor spec §15, centre_here_fits). Off the page the card has no size, so a drawing aimed then lands off the frame.
// Roger, 1 Nov 2026: "centre here seems to always cause the drawing to fail completely". The card drawn around a new
// centre fits, its centre in the middle: the last layout's zoom and pan do not fit the new one.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { PATH, NOTE } from './host/card-notes.js';
import { fakeContext } from './host/fake-obsidian.js';

before(() => build());

/** Draws the note's first block off the page with no size, then puts it on the page `width` wide. */
async function drawnOffPage(env, width) {
  const note = env.state.files.get(PATH),
    lines = note.split('\n'),
    open = lines.findIndex((l) => l.startsWith('```gql'));
  let end = open + 1;
  while (!/^```\s*$/.test(lines[end])) end++;
  const el = env.doc.createElement('div');
  env.doc.width = 0;
  await env.state.processors.get('gql')(lines.slice(open + 1, end).join('\n'), el, fakeContext(note, open));
  env.doc.width = width;
  env.doc.body.appendChild(el);
  return el;
}

describe('a card drawn off the page', () => {
  // proves: centre_here_fits
  test('fits the frame it is put in, no wider than it', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const el = await drawnOffPage(env, 300);
      const svg = () => el.querySelector('svg.thoughtknot-svg');
      await until(() => !!svg());
      await until(() => Number(svg().getAttribute('width')) <= 300, 1000).catch(() => {});
      assert.ok(Number(svg().getAttribute('width')) <= 300, `drawn ${svg().getAttribute('width')} wide in 300`);
    } finally {
      env.uninstall();
    }
  });
});
