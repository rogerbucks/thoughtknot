// An exploration saved in the style graph (editor spec §71). Roger chose, 31 Oct 2026, to build saving now. The built
// plugin, loaded against the stand-ins for the page. Requirement: explore_saved.
// - A note whose style block saves an exploration opens on it: its centre and the things it showed, and no others.
// - In edit mode the sidebar's Save writes it as one Explore line; in reading view it offers no Save.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fakeContext } from './host/fake-obsidian.js';
import { GRAPH } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const STYLE = [
  '```gql',
  '// graph: reader_style · STYLE reader',
  "(explore_1:Explore {centre: 'tablet', shown: 'q'})",
  '```',
];
const NOTE = ['# Reader', '', '```gql', GRAPH, '```', '', ...STYLE, ''].join('\n');
const thing = (el, key) => el.querySelector(`g.node[data-key="${key}"]`);
const said = (el) => el.querySelector('.thoughtknot-untangle')?.textContent ?? '';
const saveButton = (el) =>
  el.querySelectorAll('.thoughtknot-explore-sidebar button').find((b) => b.textContent === 'Save');

/** The card for the note's graph block, drawn in edit mode or reading view; and its plugin, to unload. */
async function card(editing) {
  const env = await load({ files: { [PATH]: NOTE } });
  const page = env.doc.body.createDiv({ cls: editing ? 'markdown-source-view' : 'markdown-reading-view' });
  const el = page.createDiv({ cls: 'block-language-gql' });
  await env.state.processors.get('gql')(GRAPH, el, fakeContext(NOTE, 2));
  return { env, el };
}

// proves: explore_saved
test('a note opens on the exploration its style block saved, and Save writes it again in edit mode', async () => {
  const { env, el } = await card(true);
  try {
    await until(() => /Exploring from Tablet/.test(said(el)));
    await until(() => !thing(el, 'large') && !!thing(el, 'q'));
    assert.ok(thing(el, 'tablet'), 'its centre');
    assert.ok(!thing(el, 'eyes'), 'a thing it did not show stays hidden');
    assert.ok(!el.querySelector('.thoughtknot-explore-sidebar').hidden);
    // open one more branch, then save: the one line changes in place
    el.querySelector('.thoughtknot-explore-sidebar')
      .querySelectorAll('button')
      .find((b) => b.textContent === 'rings')
      .click();
    saveButton(el).click();
    await until(() => env.state.files.get(PATH) !== NOTE);
    const now = env.state.files.get(PATH);
    assert.match(now, /\(explore_1:Explore \{centre: 'tablet', shown: 'q', shape: 'rings', per_branch: 12\}\)/);
    assert.equal(now.match(/:Explore/g).length, 1, 'never written twice');
  } finally {
    env.plugin.onunload();
    env.uninstall();
  }
});

// proves: explore_saved
test('in reading view it opens on the exploration saved, but offers no Save', async () => {
  const { env, el } = await card(false);
  try {
    await until(() => /Exploring from Tablet/.test(said(el)));
    await until(() => !thing(el, 'large') && !!thing(el, 'q'));
    assert.equal(saveButton(el), undefined);
  } finally {
    env.plugin.onunload();
    env.uninstall();
  }
});
