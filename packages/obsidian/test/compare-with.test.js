// Compare with, on a card in Obsidian (editor spec §41, changes_view_obsidian; risk NEURO-2). The plug-in keeps the text
// a note had just before it changed it, in its own data. The card's Compare with draws that version with the note now,
// each change marked, and lists the same changes in words. A note never changed by the plug-in has nothing to compare.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { labelled } from './host/notes.js';
import { PATH, NOTE, READER, show } from './host/card-notes.js';

before(() => build());

/** The Compare with window open now, if any. */
const compareOf = (env) => env.state.modals.find((m) => m.modalEl.classList.contains('thoughtknot-compare'));

// proves: changes_view_obsidian
test('after the card is edited, Compare with draws the note before the edit with it now, each change listed', async () => {
  const env = await load({ files: { [PATH]: NOTE } });
  try {
    const el = await show(env);
    labelled(el, 'Edit here').click();
    await until(() => !!el.querySelector('textarea'));
    const t = el.querySelector('textarea');
    t.value =
      READER.replace("name: 'Large reader'", "name: 'Large reader', price: 120") +
      ",\n(small:Option {name: 'Small reader'})";
    t.dispatch('input');
    await until(() => env.state.files.get(PATH).includes('Small reader'), 2000);
    labelled(el, 'Done').click();
    await until(() => el.querySelector('textarea') === null);
    const card = await show(env);
    labelled(card, 'Compare with…').click();
    const modal = compareOf(env);
    assert.ok(modal, 'the window opens');
    assert.match(modal.titleEl.textContent, /Compare graph reader with/);
    const options = modal.contentEl.querySelectorAll('option');
    assert.equal(options.length, 1, 'one version: the note before the edit');
    assert.match(options[0].textContent, /^Before ThoughtKnot changed it, /);
    await until(() => modal.contentEl.querySelectorAll('.thoughtknot-change').length > 0, 2000);
    const said = modal.contentEl.querySelectorAll('.thoughtknot-change').map((li) => li.textContent);
    assert.ok(
      said.some((s) => s.startsWith('Added') && s.includes('Small reader')),
      said.join(' / '),
    );
    assert.ok(
      said.some((s) => s.startsWith('Changed') && s.includes('Large reader') && s.includes('price')),
      said.join(' / '),
    );
    await until(() => !!modal.contentEl.querySelector('img'), 4000);
    const img = modal.contentEl.querySelector('img');
    assert.match(img.getAttribute('src'), /^data:image\/svg\+xml/);
    assert.equal(img.getAttribute('aria-describedby'), 'thoughtknot-compare-list', 'the list describes the drawing');
  } finally {
    env.uninstall();
  }
});

// proves: changes_view_obsidian
test('a note the plug-in never changed says no earlier version is kept yet', async () => {
  const env = await load({ files: { [PATH]: NOTE } });
  try {
    const el = await show(env);
    labelled(el, 'Compare with…').click();
    assert.match(compareOf(env).contentEl.textContent, /No earlier version of this note is kept yet/);
  } finally {
    env.uninstall();
  }
});

// proves: changes_view_obsidian
test('a version picked while the last is still read shows only the one picked last', async () => {
  const older = {
    text: NOTE.replace("name: 'Large reader'", "name: 'Large reader', price: 90"),
    at: '2026-10-30T09:00:00Z',
  };
  const newer = { text: NOTE.replace('Large reader', 'Larger reader'), at: '2026-10-31T09:00:00Z' };
  const env = await load({ files: { [PATH]: NOTE }, data: { history: { [PATH]: [newer, older] } } });
  try {
    const el = await show(env);
    const vault = env.app.vault,
      read = vault.read;
    let release;
    const held = new Promise((r) => (release = r));
    let first = true;
    vault.read = async (f) => {
      if (first) {
        first = false;
        await held; // the newest, opened first, is read slowly
      }
      return read(f);
    };
    labelled(el, 'Compare with…').click();
    const modal = compareOf(env);
    const pick = modal.contentEl.querySelector('select');
    pick.value = '1';
    modal.contentEl.querySelector('button').click();
    await until(() => !!modal.contentEl.querySelector('h3'), 2000);
    release();
    await until(() => !!modal.contentEl.querySelector('img'), 4000);
    await new Promise((r) => setImmediate(r));
    const headings = modal.contentEl.querySelectorAll('h3');
    assert.equal(headings.length, 1);
    assert.ok(
      headings[0].textContent.includes(pick.querySelectorAll('option')[1].textContent),
      headings[0].textContent,
    );
    const said = modal.contentEl.querySelectorAll('.thoughtknot-change').map((li) => li.textContent);
    assert.ok(
      said.some((s) => s.includes('price')),
      said.join(' / '),
    );
  } finally {
    env.uninstall();
  }
});
