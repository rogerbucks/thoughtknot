// Describing a rule in words, from the Highlight things form (editor spec §56, rule_look_describe). The form offers a box
// only while AI is on. The words go through the one send dialog: the exact request is shown, and only Send sends it.
// What comes back only fills the form's steps. It is never tried or saved by the AI, and an answer that is not one rule
// over what the graph holds fills nothing. The fake host never reaches the network.
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';
import { fence, labelled } from './host/notes.js';
import { show } from './host/view-notes.js';

before(() => build());

const PATH = 'Some note.md';
const DATA = `// graph: work
(roof:Task {name: 'Roof', status: 'late'}),
(walls:Task {name: 'Walls', status: 'done'}),
(floor:Task {name: 'Floor', status: 'late'}),
(roof)-[:NEEDS {weight: 3}]->(walls)`;
const NOTE = `---\nclassification: Public\n---\n# Work\n\n${fence(DATA)}\n`;
const LOCAL = {
  name: 'Local',
  purpose: 'Proposing changes',
  ceiling: 'Internal',
  endpoint: 'http://localhost:11434/v1/chat/completions',
  model: 'llama3',
};
const ON = { data: { settings: { aiUse: 'on', aiPublic: 'note', aiModels: [LOCAL] } } };
const OPEN = 'Highlight things that match a rule';
const GOOD = {
  on: 'things',
  of: 'Task',
  tests: [{ field: 'status', op: 'is', value: 'late' }],
  colour: 'red',
  badge: 'clock',
};
const answer = (body) => async () => ({
  status: 200,
  text: JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }),
});
const dialog = (env) => env.state.modals.at(-1);
const button = (m, label) => m.contentEl.querySelectorAll('button').find((b) => b.getAttribute('aria-label') === label);
const field = (form, name) => form.querySelector(`[name="${name}"]`).value;

/** The form, opened, with the words typed and the box's button pressed: the dialog it opens. */
async function asked(env, words) {
  const { el } = await show(env, NOTE, 0);
  labelled(el, OPEN).click();
  const form = el.querySelector('.thoughtknot-rule-form');
  const box = form.querySelector('[name="describe"]');
  box.value = words;
  box.dispatch('input');
  labelled(form, 'Ask AI to fill it in').click();
  await until(() => !!dialog(env));
  return { el, form, m: dialog(env) };
}

describe('rule_look_describe', () => {
  test('words are shown, sent on Send, and only fill the form: nothing is tried or saved', async () => {
    const env = await load({ files: { [PATH]: NOTE }, ...ON });
    try {
      const { el, form, m } = await asked(env, 'late tasks, in red with a clock');
      button(m, 'Show what will be sent').click();
      await until(() => m.contentEl.querySelector('.thoughtknot-ai-body'));
      assert.match(
        m.contentEl.querySelector('.thoughtknot-ai-body').textContent,
        /Question: late tasks, in red with a clock/,
      );
      assert.deepEqual(env.state.requests, [], 'nothing is sent until Send is pressed');
      env.state.reply = answer(GOOD);
      button(m, 'Send').click();
      await until(() => field(form, 'when') === 'status == "late"');
      assert.equal(env.state.requests.length, 1, 'one send');
      assert.equal(field(form, 'badge'), 'clock');
      assert.equal(field(form, 'colour'), 'red');
      assert.match(
        form.querySelector('.thoughtknot-rule-found').textContent,
        /Finds 2: Roof, Floor/,
        'the live count shows',
      );
      assert.equal(el.querySelector('.thoughtknot-rule-tried'), null, 'not tried by the AI');
      assert.equal(env.state.files.get(PATH), NOTE, 'not saved by the AI');
    } finally {
      env.uninstall();
    }
  });

  test('an answer that is not one rule over what the graph holds fills nothing', async () => {
    const env = await load({ files: { [PATH]: NOTE }, ...ON });
    try {
      const { form, m } = await asked(env, 'late tasks');
      button(m, 'Show what will be sent').click();
      await until(() => m.contentEl.querySelector('.thoughtknot-ai-body'));
      env.state.reply = answer({ ...GOOD, tests: [{ field: 'secret', op: 'is', value: 'x' }] });
      button(m, 'Send').click();
      await until(() => /does not have/.test(m.contentEl.textContent));
      assert.equal(field(form, 'when'), '', 'the form is as it was');
    } finally {
      env.uninstall();
    }
  });

  test('with AI off the form offers no box', async () => {
    const env = await load({ files: { [PATH]: NOTE } });
    try {
      const { el } = await show(env, NOTE, 0);
      labelled(el, OPEN).click();
      assert.equal(el.querySelector('.thoughtknot-rule-form [name="describe"]'), null);
    } finally {
      env.uninstall();
    }
  });
});
