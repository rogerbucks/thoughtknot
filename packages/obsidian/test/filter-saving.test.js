// A filter saved by name (editor spec ES§25). Roger, 13 Nov 2026: "also allow a save of the query tree". The built
// plugin, loaded against the stand-ins for the page. Requirement: untangle_filter_saved.
// - In edit mode the Filter panel saves the filter by a name, as one NamedFilter line in the style block.
// - A saved filter is picked from its list: it fills the rows as saved, and shows only when Show these is pressed.
// - Delete takes it out of the note, and the toast's one Undo puts it back.
// - In reading view the list is there, but there is no Save and no Delete.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fakeContext } from './host/fake-obsidian.js';
import { fence, labelled } from './host/notes.js';

before(() => build());

const PATH = 'Some note.md';
const DATA = `// graph: work
(roof:Task {name: 'Roof', status: 'late', owner: 'Sam'}),
(walls:Task {name: 'Walls', status: 'done', owner: 'Ana'}),
(floor:Task {name: 'Floor', status: 'late', owner: 'Ana'}),
(roof)-[:NEEDS]->(walls), (floor)-[:NEEDS]->(roof)`;
const SAVED = [
  '```gql',
  '// graph: work_style · STYLE work',
  `(named_1:NamedFilter {name: 'Late', when: 'status == "late"'})`,
  '```',
];
const NOTE = `---\nclassification: Public\n---\n# Work\n\n${fence(DATA)}\n`;
const WITH_SAVED = `${NOTE}\n${SAVED.join('\n')}\n`;
const panelOf = (el) => el.querySelector('.thoughtknot-filter-ask');
const said = (el) => panelOf(el).querySelector('[role="status"]').textContent;
const savedList = (el) => panelOf(el).querySelector('select[name="filter-saved"]');
const keys = (el, cls) =>
  el
    .querySelectorAll('g.node')
    .filter((g) => g.hasClass(cls))
    .map((g) => g.getAttribute('data-key'))
    .sort();

/** The card for the note's graph block, in edit mode or reading view, with its Filter panel open. */
async function card(note, editing) {
  const env = await load({ files: { [PATH]: note } });
  const page = env.doc.body.createDiv({ cls: editing ? 'markdown-source-view' : 'markdown-reading-view' });
  const el = page.createDiv({ cls: 'block-language-gql' });
  await env.state.processors.get('gql')(DATA, el, fakeContext(note, note.split('\n').indexOf('```gql')));
  await until(() => el.querySelector('g.node'));
  labelled(el, 'Filter by kind or link').click();
  return { env, el };
}

// proves: untangle_filter_saved
test('in edit mode a filter built is saved by a name, as one NamedFilter line in the style block', async () => {
  const { env, el } = await card(NOTE, true);
  try {
    const panel = panelOf(el);
    assert.equal(savedList(el), null, 'no list while nothing is saved');
    const save = labelled(panel, 'Save this filter by name');
    assert.ok(save.disabled, 'nothing to save yet');
    const tests = panel.querySelectorAll('.thoughtknot-rule-test');
    tests[1].querySelector('select[aria-label="Property"]').value = 'owner';
    tests[1].querySelector('select[aria-label="Property"]').dispatch('change');
    const value = panel.querySelectorAll('.thoughtknot-rule-test')[1].querySelector('input');
    value.value = 'Sam';
    value.dispatch('input');
    save.click();
    const name = panel.querySelector('input[name="filter-name"]');
    assert.equal(name.value, 'Things where owner is Sam', 'its plain words to start with');
    name.value = 'Of Sam';
    labelled(panel, 'Save').click();
    await until(() => env.state.files.get(PATH) !== NOTE);
    const now = env.state.files.get(PATH);
    assert.match(now, /\(named_1:NamedFilter \{name: 'Of Sam', when: 'owner == "Sam"'\}\)/);
    assert.ok(now.startsWith(NOTE.trimEnd()), 'the data is untouched');
    assert.match(env.state.notices.at(-1), /Saved the filter Of Sam/);
  } finally {
    env.plugin.onunload();
    env.uninstall();
  }
});

// proves: untangle_filter_saved
test('a saved filter picked fills the rows, shows on Show these, and Delete has one Undo', async () => {
  const { env, el } = await card(WITH_SAVED, true);
  try {
    const list = savedList(el);
    assert.deepEqual(
      list.querySelectorAll('option').map((o) => o.textContent),
      ['Saved filters', 'Late'],
    );
    list.value = 'Late';
    list.dispatch('change');
    assert.match(said(el), /Filled in from the saved filter Late\. Keeps 2 of 3\./);
    assert.deepEqual(keys(el, 'thoughtknot-dim'), [], 'nothing changes before Show these');
    labelled(panelOf(el), 'Show these').click();
    assert.deepEqual(keys(el, 'thoughtknot-kept'), ['floor', 'roof']);
    labelled(panelOf(el), 'Delete the saved filter picked').click();
    await until(() => !env.state.files.get(PATH).includes('NamedFilter'));
    assert.match(env.state.notices.at(-1), /Deleted the saved filter Late/);
    env.state.noticeEls.at(-1).querySelector('.thoughtknot-notice-undo').click();
    await until(() => env.state.files.get(PATH) === WITH_SAVED);
    await until(() => /Put back the saved filter Late/.test(env.state.notices.at(-1)));
  } finally {
    env.plugin.onunload();
    env.uninstall();
  }
});

// proves: untangle_filter_saved
test('in reading view a saved filter can be picked, but not saved or deleted', async () => {
  const { env, el } = await card(WITH_SAVED, false);
  try {
    assert.ok(savedList(el));
    assert.equal(labelled(panelOf(el), 'Save this filter by name'), undefined);
    assert.equal(labelled(panelOf(el), 'Delete the saved filter picked'), undefined);
  } finally {
    env.plugin.onunload();
    env.uninstall();
  }
});
