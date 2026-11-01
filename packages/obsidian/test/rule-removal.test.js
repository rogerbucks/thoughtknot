// Changing the rules saved, from the Highlight things form (editor spec §56, rule_look_remove and rule_look_off). A
// saved rule can be taken out, and one Undo puts the note back. It can be copied, renamed in place, moved up, and
// turned off and on again. In reading view each is only tried, the note left as it was.
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

  test('a saved rule is copied as a new rule, renamed in place, and moved up; Escape closes the form', async () => {
    const DUE = `(due:Look {when: 'status == "late"', colour: 'orange', badge: 'warning', means: 'Due'})`;
    const note = noteOf(DATA, `${STYLE},\n${DUE}`);
    const env = await load({ files: { [PATH]: note } });
    try {
      const { el } = await show(env, note, 0);
      const form = opened(el);
      assert.ok(!labelled(form, 'Move the rule Late up, so it wins a clash'), 'the first rule has no Up');
      labelled(form, 'Copy the rule Late to make a new one').click();
      assert.equal(field(form, 'means'), 'Late (copy)', 'a copy, named apart');
      assert.equal(field(form, 'was'), '', 'saved as a new rule');
      labelled(form, 'Change the rule Late').click();
      assert.equal(field(form, 'was'), 'Late');
      type(form, 'Value', 'done');
      const means = form.querySelector('[name="means"]');
      means.value = 'Finished';
      means.dispatch('input');
      form.dispatch('submit');
      await until(() => /means: 'Finished'/.test(env.state.files.get(PATH)));
      const renamed = env.state.files.get(PATH);
      assert.doesNotMatch(renamed, /means: 'Late'/, 'renamed in place, not copied');
      labelled(form, 'Move the rule Due up, so it wins a clash').click();
      await until(() => env.state.files.get(PATH).indexOf("'Due'") < env.state.files.get(PATH).indexOf("'Finished'"));
      form.dispatch('keydown', { key: 'Escape' });
      assert.equal(form.hidden, true, 'Escape closes the form');
    } finally {
      env.uninstall();
    }
  });

  test('with no rules saved, the form says so', async () => {
    const note = noteOf(DATA);
    const env = await load({ files: { [PATH]: note } });
    try {
      const form = opened(await readCard(env, note));
      assert.match(form.textContent, /No rules yet/);
    } finally {
      env.uninstall();
    }
  });

  test('a saved rule is turned off and on again: kept in the note, drawn only when on', async () => {
    const note = noteOf(DATA, STYLE);
    const env = await load({ files: { [PATH]: note } });
    try {
      const { el } = await show(env, note, 0);
      labelled(opened(el), 'Turn the rule Late off, keeping it').click();
      await until(() => /off: true/.test(env.state.files.get(PATH)));
      const off = env.state.files.get(PATH);
      assert.match(off, /means: 'Late'/, 'kept in the style graph');
      const { el: again } = await show(env, off, 0);
      assert.equal(node(again, 'roof').querySelector('.thoughtknot-rule-badge'), null, 'drawn nothing while off');
      const form = opened(again);
      assert.ok(form.querySelector('.thoughtknot-rule-mine.is-off'), 'shown as off');
      labelled(form, 'Turn the rule Late back on').click();
      await until(() => !/off:/.test(env.state.files.get(PATH)));
      assert.equal(env.state.files.get(PATH), note, 'on again, the note as it was');
    } finally {
      env.uninstall();
    }
  });

  test('in reading view a rule turned off is only tried', async () => {
    const note = noteOf(DATA, STYLE);
    const env = await load({ files: { [PATH]: note } });
    try {
      const el = await readCard(env, note);
      labelled(opened(el), 'Turn the rule Late off, keeping it').click();
      await until(() => !!el.querySelector('.thoughtknot-rule-tried'));
      assert.equal(node(el, 'roof').querySelector('.thoughtknot-rule-badge'), null);
      assert.equal(env.state.files.get(PATH), note, 'tried, never written');
      assert.ok(labelled(el, 'Turn the rule Late back on'), 'and offered to turn on again');
    } finally {
      env.uninstall();
    }
  });
});
