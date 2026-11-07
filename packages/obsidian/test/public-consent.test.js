// Letting a public reviewer see this vault, in Obsidian (editor spec §19, ai_public_names_only; Roger, 7 Nov 2026, R7).
// Off until chosen. Raising it shows what one real note would send, and only Allow saves it. Lowering it, or turning
// it off, is saved at once. The core's rule is tested in packages/core/test/ai-reviewers.test.js.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';

const GRAPH = "// graph: trip\n(ann:Person {name: 'Ann', born: 1990}),\n(bob:Person),\n(ann)-[:KNOWS]->(bob)";
const NOTE = `# Trip\n\nPrivate prose.\n\n\`\`\`gql\n${GRAPH}\n\`\`\`\n`;
const LABEL = 'Public reviewers in this vault';

describe('in Obsidian, a public reviewer for this vault', () => {
  let env = null;
  after(() => env?.uninstall());

  async function open(settings = {}, files = { 'Trip.md': NOTE }) {
    await build();
    env?.uninstall();
    env = await load({ files, data: { settings } });
    env.state.active = Object.keys(files)[0];
    return env;
  }

  /** The setting's dropdown on the settings page, freshly drawn. */
  function select(e) {
    const tab = e.state.settingTabs[0];
    tab.display();
    const row = tab.containerEl
      .querySelectorAll('.setting-item')
      .find((r) => r.querySelector('.setting-item-name')?.textContent === LABEL);
    assert.ok(row, 'the setting is on the page');
    return row.querySelector('select');
  }

  /** Chooses `value` on the page. */
  function choose(e, value) {
    const sel = select(e);
    sel.value = value;
    sel.dispatch('change');
  }

  /** Presses a button of the dialog open now, by its words. */
  const press = (e, label) =>
    e.state.modals
      .at(-1)
      .contentEl.querySelectorAll('button')
      .find((b) => b.getAttribute('aria-label') === label)
      .click();

  test('is off until chosen', async () => {
    const e = await open();
    assert.equal(select(e).value, 'off');
  });

  test('raised, it first shows what this note would send: names, kinds and links only, never a value or the prose', async () => {
    const e = await open();
    choose(e, 'names');
    await until(() => e.state.modals.length);
    const shown = e.state.modals.at(-1).contentEl.textContent;
    assert.match(shown, /Trip\.md/);
    assert.match(shown, /ann: Person \(Ann\)/);
    assert.match(shown, /ann -\[KNOWS\]-> bob/);
    assert.doesNotMatch(shown, /1990|Private prose/);
    press(e, 'Keep private');
    await until(() => !e.state.modals.length);
    assert.notEqual(e.state.data?.settings?.aiPublic, 'names', 'nothing is saved without Allow');
  });

  test('only Allow saves it; note text shows the whole note first', async () => {
    const e = await open({ aiPublic: 'names' });
    choose(e, 'note');
    await until(() => e.state.modals.length);
    assert.match(e.state.modals.at(-1).contentEl.textContent, /Private prose/);
    press(e, 'Allow');
    await until(() => e.state.data?.settings?.aiPublic === 'note');
  });

  test('is withdrawn in one step: off is saved at once, with nothing to confirm', async () => {
    const e = await open({ aiPublic: 'note' });
    choose(e, 'off');
    await until(() => e.state.data?.settings?.aiPublic === 'off');
    assert.equal(e.state.modals.length, 0);
  });

  test('with no note holding a graph there is nothing to show, so it says so and stays off', async () => {
    const e = await open({}, { 'Plain.md': '# Plain\n\nNo graph here.\n' });
    choose(e, 'names');
    await until(() => e.state.notices.some((n) => /Open a note with a graph/.test(n)));
    assert.equal(e.state.modals.length, 0);
    assert.notEqual(e.state.data?.settings?.aiPublic, 'names');
  });
});
