// Where was I? in Obsidian (editor spec ES§74, since_you_left). After a break, a quiet item in the status bar offers
// the view. The view lists the last place and each change since. Nothing opens or moves until Go there is pressed, and
// closing the view loses nothing.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';

before(() => build());

const ago = (minutes) => new Date(Date.now() - minutes * 60_000);
const data = (minutes) => ({
  settings: {},
  visits: [{ path: 'Plan.md', graph: 'plan', thing: 'login', at: ago(minutes).toISOString() }],
});
const files = { 'Plan.md': '# Plan\n', 'Budget.md': '# Budget\n', 'Old.md': '# Old\n' };
const mtimes = () => ({ 'Plan.md': ago(200).getTime(), 'Budget.md': ago(30).getTime(), 'Old.md': ago(500).getTime() });
const text = (el) => el.textContent;

describe('where was I? in Obsidian (since_you_left)', () => {
  test('after a break: the status bar offers it, and the view lists the last place and each change since', async () => {
    const { state, plugin, uninstall } = await load({ files, data: data(120), mtimes: mtimes() });
    try {
      const [item] = state.statusBar ?? [];
      assert.ok(item, 'the status bar offers it');
      assert.equal(state.modals.length, 0, 'it is offered, never opened unasked');
      assert.equal(state.opened, undefined, 'no note is opened unasked');
      item.click();
      const [view] = state.modals;
      assert.match(text(view.contentEl), /You were last here 2 hours ago/);
      assert.match(text(view.contentEl), /login in plan, in Plan\.md/);
      assert.match(text(view.contentEl), /Budget\.md, changed/);
      assert.doesNotMatch(text(view.contentEl), /Old\.md/);
      assert.equal(state.opened, undefined, 'the drawing and the notes are left as they were');
      // closed, nothing is lost: the status bar and the command still offer it, the same
      view.close();
      assert.ok(item.isConnected !== false);
      state.commands.find((c) => c.id === 'where-was-i').callback();
      assert.match(text(state.modals[0].contentEl), /Budget\.md, changed/);
      // Go there opens the place, asked
      state.modals[0].contentEl.querySelectorAll('button')[0].click();
      await until(() => state.opened);
      assert.equal(state.opened.link, 'Plan.md');
    } finally {
      plugin.onunload();
      uninstall();
    }
  });

  test('before a break nothing is offered in the status bar, but the command still opens it', async () => {
    const { state, plugin, uninstall } = await load({ files, data: data(5), mtimes: mtimes() });
    try {
      assert.equal((state.statusBar ?? []).length, 0);
      state.commands.find((c) => c.id === 'where-was-i').callback();
      assert.match(text(state.modals[0].contentEl), /You were last here 5 minutes ago/);
    } finally {
      plugin.onunload();
      uninstall();
    }
  });
});
