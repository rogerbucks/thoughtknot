// One graph from many places in the plug-in (editor spec §63, connector_many_sources, connector_source_missing).
// A block whose FROM lists a .gql file and a note draws one graph of both, read through the vault where each is written.
// It names each place it drew from, and each it could not, with why. It is drawn again when a place changes.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PEOPLE = `// graph: team
(ann:Person {name: 'Ann'}),
(bob:Person {name: 'Bob'}),
(ann)-[:KNOWS]->(bob)`;
const TEAM = [
  '# Team',
  '',
  fence("// graph: team\n(cat:Person {name: 'Cat'}),\n(ann:Person),\n(cat)-[:KNOWS]->(ann)"),
  '',
].join('\n');
const note = ['# Mine', '', fence('// graph: team · FROM Graphs/people.gql, [[Team]]'), ''].join('\n');
const keys = (el) =>
  el
    .querySelectorAll('g.node')
    .map((g) => g.getAttribute('data-key'))
    .sort();

async function card(files) {
  const env = await load({ files: { 'Mine.md': note, ...files } });
  const { el } = await show(env, note, 0);
  return { env, el };
}

describe('a block drawn from several places', () => {
  test('draws one graph of every place, names each, and writes nothing into the note', async () => {
    const { env, el } = await card({ 'Graphs/people.gql': PEOPLE, 'Team.md': TEAM });
    try {
      await until(() => keys(el).length > 0);
      assert.deepEqual(keys(el), ['ann', 'bob', 'cat']);
      const strips = el.querySelectorAll('.thoughtknot-source').map((s) => s.textContent);
      assert.equal(strips.length, 2);
      assert.match(strips.join(' '), /Graphs\/people\.gql/);
      assert.match(strips.join(' '), /Team/);
      assert.equal(env.state.files.get('Mine.md'), note);
    } finally {
      env.uninstall();
    }
  });

  test('with one place missing, the other draws and the missing one is named', async () => {
    const { env, el } = await card({ 'Graphs/people.gql': PEOPLE });
    try {
      await until(() => keys(el).length > 0);
      assert.deepEqual(keys(el), ['ann', 'bob']);
      assert.match(el.querySelector('[role="alert"]').textContent, /Team/);
    } finally {
      env.uninstall();
    }
  });

  test('is drawn again when one of its places changes', async () => {
    const { env, el } = await card({ 'Graphs/people.gql': PEOPLE, 'Team.md': TEAM });
    try {
      await until(() => keys(el).length > 0);
      await env.app.vault.modify(env.app.vault.getFileByPath('Graphs/people.gql'), `${PEOPLE},\n(dan:Person)`);
      await until(() => keys(el).includes('dan'));
      assert.deepEqual(keys(el), ['ann', 'bob', 'cat', 'dan']);
    } finally {
      env.uninstall();
    }
  });
});
