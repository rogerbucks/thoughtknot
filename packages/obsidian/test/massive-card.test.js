// A graph too large to draw, shown in its card as its overview (editor spec §53): massive-card.ts. Its intents can be
// chosen as poles the groups are placed round (§58, intent_poles_massive). Where the note is edited the poles are
// saved in the style graph, with the filter. In reading view they are only tried, and the note is left as it was.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fakeContext } from './host/fake-obsidian.js';

before(() => build());

const PATH = 'Some note.md';

/** A graph of 2,100 things in chains of 30, past the drawing limit of 2,000, with two intents some of them support. */
function huge() {
  const lines = ['// graph: big', "(early:Intent {says: 'Out early'}),", "(calm:Intent {says: 'Stay calm'}),"];
  for (let i = 0; i < 2100; i++) lines.push(`(n${i}:Thing {name: 'Item ${i}'}),`);
  for (let i = 1; i < 2100; i++) if (i % 30) lines.push(`(n${i})-[:NEAR]->(n${i - 1}),`);
  lines.push('(n1)-[:SUPPORTS]->(early),', '(n40)-[:CONTRADICTS]->(early),', '(n70)-[:SUPPORTS]->(calm)');
  return lines.join('\n');
}

/** The card of `note`'s graph, where the note is edited or in reading view, once its Poles list is drawn. */
async function card(env, note, source, view) {
  const el = env.doc.body.createDiv({ cls: view }).createDiv({ cls: 'block-language-gql' });
  await env.state.processors.get('gql')(source, el, fakeContext(note, 2));
  await until(() => !!el.querySelector('.thoughtknot-massive-poles input'), 10_000);
  return el;
}

const tick = (el, id) => {
  const box = [...el.querySelectorAll('.thoughtknot-massive-poles input')].find((b) => b.value === id);
  box.checked = true;
  box.dispatch('change');
};

// proves: intent_poles_massive
test('poles chosen where the note is edited are saved in the style graph, and in reading view only tried', async () => {
  const source = huge();
  const note = ['# Big', '', '```gql', source, '```', ''].join('\n');
  const env = await load({ files: { [PATH]: note } });
  try {
    const reading = await card(env, note, source, 'markdown-reading-view');
    assert.deepEqual(
      [...reading.querySelectorAll('.thoughtknot-massive-poles label')].map((l) => l.textContent),
      ['Out early', 'Stay calm'],
      'each intent offered by its words',
    );
    // reading view tries `calm` first; the edited note's save of `early`, queued after it, is the sign it is done
    tick(reading, 'calm');
    assert.equal(env.state.files.get(PATH), note, 'reading view saves nothing');
    const editing = await card(env, note, source, 'markdown-source-view');
    tick(editing, 'early');
    await until(() => env.state.files.get(PATH) !== note);
    assert.match(env.state.files.get(PATH), /:Filter \{keep: '', poles: 'early'\}\)/);
    assert.doesNotMatch(
      env.state.files.get(PATH),
      /poles: '[^']*calm/,
      'the poles tried in reading view are not saved',
    );
  } finally {
    env.plugin.onunload();
    env.uninstall();
  }
});
