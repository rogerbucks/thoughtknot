// proves: risk_panel
// Recently opened (risk NEURO-11). The details summary lists the last graphs and things opened, newest first.
// So someone who stopped mid-task can go back. The list is kept in the plugin's data, ten at most.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { GRAPH, show } from './host/view-notes.js';
import { tapKey } from './host/inspector-steps.js';

before(() => build());

const OPEN = { settings: { detailsOpen: 'on' } };
const panelOf = (el) => el.querySelector('.thoughtknot-details');
const SECOND = GRAPH.replace('graph: reader', 'graph: tablets');
const recentOf = (el) =>
  [...panelOf(el).querySelectorAll('.thoughtknot-summary-recent li')].map((li) => li.textContent);

const NOTES = Object.fromEntries(
  ['Readers', 'Tablets', 'Elsewhere', ...Array.from({ length: 12 }, (_, i) => `Note ${i}`)].map((n) => [`${n}.md`, '']),
);

/** The graph named, drawn in the note at `path`, which is in front. */
async function opened(env, path, graph) {
  env.state.active = path;
  const { el } = await show(env, fence(graph));
  await until(() => !!el.querySelector('g.node'));
  return el;
}

describe('the details summary lists what was opened last', () => {
  test('two graphs opened: both are listed, the newest first', async () => {
    const env = await load({ data: OPEN, files: NOTES });
    try {
      await opened(env, 'Readers.md', GRAPH);
      const el = await opened(env, 'Tablets.md', SECOND);
      const listed = recentOf(el);
      assert.deepEqual(listed, ['tablets, in Tablets', 'reader, in Readers']);
    } finally {
      env.uninstall();
    }
  });

  test('a thing opened is listed by its name, above its graph; going to it opens its note', async () => {
    const env = await load({ data: OPEN, files: NOTES });
    try {
      const el = await opened(env, 'Readers.md', GRAPH);
      tapKey(el, 'large');
      await until(() => panelOf(el).textContent.includes('Large reader'));
      [...panelOf(el).querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Close details').click();
      assert.equal(recentOf(el)[0], 'Large reader, in reader, in Readers');
      env.state.active = 'Elsewhere.md';
      const entry = [...panelOf(el).querySelectorAll('.thoughtknot-summary-recent button')][1];
      entry.click();
      await until(() => env.state.opened?.link === 'Readers.md');
    } finally {
      env.uninstall();
    }
  });

  test('the same graph opened again is listed once, and no more than ten are kept', async () => {
    const env = await load({ data: OPEN, files: NOTES });
    try {
      let el;
      for (let i = 0; i < 12; i++) el = await opened(env, `Note ${i % 12}.md`, GRAPH);
      await opened(env, 'Note 11.md', GRAPH);
      const listed = recentOf(el);
      assert.equal(new Set(listed).size, listed.length);
      assert.ok(listed.length <= 10, `${listed.length} kept`);
      assert.equal(listed[0], 'reader, in Note 11');
    } finally {
      env.uninstall();
    }
  });
});
