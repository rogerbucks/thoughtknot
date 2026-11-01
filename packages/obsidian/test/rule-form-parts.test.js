// Highlighting things by a rule built in plain words, on the card (editor spec §56, rule_look_builder). A person
// picks a property and a value from lists the graph fills, never typing a test. The form counts what the rule finds
// and previews its look as it is built, and names it for the legend. Quick starts fill a whole rule at once. A rule
// tried in reading view opens the form again on itself, to change it. A rule saved opens to change it in place.
// A rule saved can be taken out, and one Undo puts it back (rule_look_remove).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { fakeContext } from './host/fake-obsidian.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const DATA = `// graph: work
(roof:Task {name: 'Roof', status: 'late'}),
(walls:Task {name: 'Walls', status: 'done'}),
(floor:Task {name: 'Floor', status: 'late'}),
(roof)-[:NEEDS {weight: 3}]->(walls),
(walls)-[:NEEDS {weight: 1}]->(floor)`;
const STYLE = `// graph: work_style · STYLE work
(late:Look {when: 'status == "late"', colour: 'red', badge: 'clock', means: 'Late'})`;
const noteOf = (...blocks) => ['# Work', '', ...blocks.flatMap((b) => [fence(b), '']), ''].join('\n');
const node = (el, key) => el.querySelectorAll('g.node').find((g) => g.getAttribute('data-key') === key);
const OPEN = 'Highlight things that match a rule';

/** Shows the first block of `note` as reading view does, read-only. */
async function readCard(env, note) {
  const el = env.doc.body
    .createDiv({ cls: 'markdown-reading-view' })
    .createDiv({ cls: 'markdown-preview-view markdown-rendered' })
    .createDiv({ cls: 'block-language-gql' });
  const lines = note.split('\n'),
    at = lines.findIndex((l) => /^```gql/.test(l));
  const source = lines.slice(at + 1, lines.indexOf('```', at + 1)).join('\n');
  await env.state.processors.get('gql')(source, el, fakeContext(note, at));
  await until(() => !!el.querySelector('svg'));
  return el;
}

/** The form of the card in `el`, opened. */
function opened(el) {
  labelled(el, OPEN).click();
  const form = el.querySelector('.thoughtknot-rule-form');
  assert.equal(form.hidden, false, 'the form opens');
  return form;
}
/** Picks `value` in the list of `form` named `label`, as a person would. */
function choose(form, label, value) {
  const select = form.querySelectorAll('select').find((s) => s.getAttribute('aria-label') === label);
  select.value = value;
  select.dispatch('change');
}
/** Types `value` into the first box of `form` named `label`. */
function type(form, label, value) {
  const input = form.querySelectorAll('input').find((s) => s.getAttribute('aria-label') === label);
  input.value = value;
  input.dispatch('input');
}
const field = (form, name) => form.querySelector(`[name="${name}"]`).value;
const said = (form) => form.querySelector('.thoughtknot-rule-found').textContent;

describe('rule_look_builder', () => {
  test('a rule picked from lists writes its own test and name, counts what it finds, and is tried as built', async () => {
    const note = noteOf(DATA, STYLE);
    const env = await load({ files: { [PATH]: note } });
    try {
      const el = await readCard(env, note);
      let form = opened(el);
      assert.match(said(form), /Pick a property/, 'it says what to do first');
      choose(form, 'Property', 'status');
      form = el.querySelector('.thoughtknot-rule-form');
      type(form, 'Value', 'done');
      assert.equal(field(form, 'when'), 'status == "done"', 'the test is written for the person');
      assert.equal(field(form, 'means'), 'status is done', 'and named in plain words');
      assert.match(said(form), /Finds 1: Walls/, 'what it finds is counted as it is built');
      assert.match(form.querySelector('.thoughtknot-rule-sample').textContent, /Walls/, 'a preview of one found');
      type(form, 'Value', 'gone');
      assert.match(said(form), /Finds nothing yet/);
      type(form, 'Value', 'done');
      form.dispatch('submit');
      await until(() => !!el.querySelector('.thoughtknot-rule-tried'));
      assert.equal(node(el, 'walls').querySelector('.thoughtknot-rule-badge')?.textContent, '⚑', 'a flag at first');
      assert.equal(env.state.files.get(PATH), note, 'tried, never written');
      const again = el.querySelector('.thoughtknot-rule-form');
      assert.equal(again.hidden, false, 'the form opens again on the rule tried, to change it');
      assert.equal(field(again, 'means'), 'status is done');
      assert.equal(labelled(el, OPEN).getAttribute('aria-expanded'), 'true');
    } finally {
      env.uninstall();
    }
  });

  test('a quick start from the graph’s own data fills the whole rule at once', async () => {
    const note = noteOf(DATA);
    const env = await load({ files: { [PATH]: note } });
    try {
      const el = await readCard(env, note);
      const form = opened(el);
      const chips = form.querySelectorAll('.thoughtknot-rule-chip');
      assert.deepEqual(
        chips.map((c) => c.getAttribute('aria-label')),
        ['status is late', 'status is done', 'Not linked to anything', 'Linked to 3 or more'],
      );
      chips[0].click();
      assert.equal(field(form, 'when'), 'status == "late"');
      assert.equal(field(form, 'badge'), 'flag');
      assert.equal(field(form, 'colour'), 'red');
      assert.match(said(form), /Finds 2: Roof, Floor/);
    } finally {
      env.uninstall();
    }
  });

  test('a saved rule opens to change, and saving it changes it in place where the note is edited', async () => {
    const note = noteOf(DATA, STYLE);
    const env = await load({ files: { [PATH]: note } });
    try {
      const { el } = await show(env, note, 0);
      const form = opened(el);
      labelled(form, 'Change the rule Late').click();
      assert.equal(field(form, 'means'), 'Late', 'its own name is kept');
      assert.equal(field(form, 'badge'), 'clock');
      const tick = form.querySelectorAll('.thoughtknot-rule-pick').find((b) => b.getAttribute('aria-label') === 'Tick');
      tick.click();
      assert.equal(tick.getAttribute('aria-pressed'), 'true', 'the sample picked is shown pressed');
      form.dispatch('submit');
      await until(() => /badge: 'check'/.test(env.state.files.get(PATH)));
      const text = env.state.files.get(PATH);
      assert.equal(text.match(/means: 'Late'/g)?.length, 1, 'changed in place, not written twice');
      assert.match(text, /when: 'status == "late"'/);
    } finally {
      env.uninstall();
    }
  });
});

describe('rule_look_remove', () => {
  test('a saved rule is taken out where the note is edited, and Undo puts the note back byte for byte', async () => {
    const note = noteOf(DATA, STYLE);
    const env = await load({ files: { [PATH]: note } });
    try {
      const { el } = await show(env, note, 0);
      labelled(opened(el), 'Remove the rule Late').click();
      await until(() => !/means: 'Late'/.test(env.state.files.get(PATH)));
      const removed = env.state.files.get(PATH);
      assert.ok(!removed.includes(':Look'), 'the rule is gone, and nothing else');
      const { el: again } = await show(env, removed, 0);
      assert.match(again.querySelector('.thoughtknot-rule-tried')?.textContent ?? '', /Removed the rule Late/);
      assert.equal(again.querySelector('.thoughtknot-rule-form').hidden, false, 'the form stays open where it was');
      labelled(again, 'Put back the rule Late').click();
      await until(() => env.state.files.get(PATH) === note);
      const { el: back } = await show(env, note, 0);
      assert.equal(back.querySelector('.thoughtknot-rule-tried'), null, 'one Undo, then nothing more to put back');
    } finally {
      env.uninstall();
    }
  });

  test('in reading view a rule taken out is only tried, the note left as it was', async () => {
    const note = noteOf(DATA, STYLE);
    const env = await load({ files: { [PATH]: note } });
    try {
      const el = await readCard(env, note);
      assert.ok(node(el, 'roof').querySelector('.thoughtknot-rule-badge'), 'drawn with the rule at first');
      labelled(opened(el), 'Remove the rule Late').click();
      await until(() => !!el.querySelector('.thoughtknot-rule-tried'));
      assert.equal(node(el, 'roof').querySelector('.thoughtknot-rule-badge'), null, 'drawn as if it were gone');
      assert.equal(env.state.files.get(PATH), note, 'tried, never written');
      assert.ok(!labelled(el, 'Remove the rule Late'), 'no longer listed among the rules saved');
    } finally {
      env.uninstall();
    }
  });
});
