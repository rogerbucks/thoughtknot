// A card drawn off the page, as Live Preview draws each card before it puts it there, fits its frame once it is placed
// (editor spec §15, centre_here_fits). Off the page the card has no size, so a drawing aimed then lands off the frame.
// Roger, 1 Nov 2026: "centre here seems to always cause the drawing to fail completely". The card drawn around a new
// centre fits, its centre in the middle: the last layout's zoom and pan do not fit the new one.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { PATH, NOTE } from './host/card-notes.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';
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
      // fitted to 300 across, as wide as that or, for a tall drawing, narrower; never wider, never nothing
      await until(() => Number(svg().getAttribute('width')) <= 300, 1000);
      assert.ok(Number(svg().getAttribute('width')) > 0, 'drawn, not shrunk to nothing');
    } finally {
      env.uninstall();
    }
  });

  // proves: centre_here_fits
  test('Centre here leaves no zoom, pan or selection for the card drawn next, only its new centre in the middle', async () => {
    const SKY = `// graph: sky
(sun:Star {name: 'Sun'}),
(earth:Planet {name: 'Earth'}),
(moon:Moon {name: 'The moon'}),
(earth)-[:CIRCLES]->(sun),
(moon)-[:CIRCLES]->(earth)`;
    const note = ['# Sky', '', fence(SKY), ''].join('\n');
    const env = await load({ files: { 'Sky.md': note } });
    const left = [];
    const leave = env.plugin.tried.leave.bind(env.plugin.tried);
    env.plugin.tried.leave = (at, where) => (left.push(where), leave(at, where));
    try {
      const { el } = await show(env, note, 0);
      labelled(el, 'Zoom in').click();
      labelled(el, 'Zoom in').click();
      el.querySelectorAll('g.node')
        .find((n) => n.getAttribute('data-key') === 'moon')
        .dispatch('keydown', { key: 'Enter' });
      el.querySelectorAll('button')
        .find((b) => b.textContent === 'Centre here')
        .click();
      await until(() => left.length > 0);
      const at = left.at(-1);
      assert.deepEqual([at.zoom, at.x, at.y, at.selected], [undefined, undefined, undefined, undefined]);
      assert.equal(at.middle, 'moon', 'the new centre is put in the middle');
      assert.ok(at.places instanceof Map, 'each box glides from where it was');
    } finally {
      env.uninstall();
    }
  });
});
