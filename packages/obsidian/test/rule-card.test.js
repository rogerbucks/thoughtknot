// Rules and looks on a card (editor spec §56). Each thing or link a style rule finds is drawn with its look: the rule's
// style token, its line, and its badge beside its name. A screen reader hears what the rule means. The legend lists
// each rule drawn with its badge and meaning. A view's card draws the rules for every drawing and its own. Two rules
// that set one part of a thing are a clash, listed with the card's problems. Beside the legend a rule can be made. In
// reading view it is only tried, and the note is left as it was. Where the note is edited it is saved.
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
(late:Look {when: 'status == "late"', colour: 'red', badge: 'clock', means: 'Late'}),
(heavy:Look {when: 'weight > 2', type: 'NEEDS', line: 'bold', means: 'Heavy need'})`;
const VIEW = "// graph: work · QUERY view the_roof\nMATCH (n {id: 'roof'})-[]-{1,1}(m) RETURN n, m";
const noteOf = (...blocks) => ['# Work', '', ...blocks.flatMap((b) => [fence(b), '']), ''].join('\n');
const node = (el, key) => el.querySelectorAll('g.node').find((g) => g.getAttribute('data-key') === key);

async function card(note, n = 0) {
  const env = await load({ files: { [PATH]: note } });
  const { el } = await show(env, note, n);
  return { env, el };
}

describe('rule_look_not_colour_alone', () => {
  test('each thing a rule finds carries its style token, its badge and its meaning, never colour alone', async () => {
    const { env, el } = await card(noteOf(DATA, STYLE));
    try {
      for (const key of ['roof', 'floor']) {
        const g = node(el, key);
        assert.equal(g.getAttribute('data-style'), 'look.late', `${key} carries the rule's token`);
        assert.ok(g.classList.contains('thoughtknot-rule'));
        assert.equal(g.querySelector('.thoughtknot-rule-badge')?.textContent, '⏱', `${key} carries the badge`);
        assert.match(g.getAttribute('aria-label') ?? '', /Late/, 'its meaning is said');
      }
      const walls = node(el, 'walls');
      assert.equal(walls.getAttribute('data-style'), null, 'a thing no rule finds is drawn as it always was');
      assert.equal(walls.querySelector('.thoughtknot-rule-badge'), null);
      const heavy = el.querySelectorAll('g.edge[data-link]').filter((g) => g.classList.contains('thoughtknot-rule'));
      assert.equal(heavy.length, 1, 'one link passes the rule on links');
      assert.ok(heavy[0].classList.contains('thoughtknot-line-bold'));
    } finally {
      env.uninstall();
    }
  });
});

describe('rule_look_legend', () => {
  test("the card's legend lists each rule drawn with its badge and what it means", async () => {
    const { env, el } = await card(noteOf(DATA, STYLE));
    try {
      const legend = el.querySelector('.thoughtknot-rule-legend');
      assert.ok(legend, 'a legend');
      assert.match(legend.textContent, /⏱\s*Late/);
      assert.match(legend.textContent, /Heavy need/);
      assert.ok(legend.querySelector('.thoughtknot-rule-line.is-bold'), 'a sample of the line beside the words');
    } finally {
      env.uninstall();
    }
  });

  test('a view card draws the rules for every drawing too', async () => {
    const { env, el } = await card(noteOf(DATA, VIEW, STYLE), 1);
    try {
      assert.equal(node(el, 'roof')?.getAttribute('data-style'), 'look.late');
      assert.match(el.querySelector('.thoughtknot-rule-legend')?.textContent ?? '', /Late/);
    } finally {
      env.uninstall();
    }
  });
});

describe('rule_look_order', () => {
  test('a clash between two rules is listed with the card’s problems, naming both', async () => {
    const clash = `${STYLE},\n(also:Look {when: 'status == "late"', badge: 'flag', means: 'Behind'})`;
    const { env, el } = await card(noteOf(DATA, clash));
    try {
      assert.equal(node(el, 'roof').querySelector('.thoughtknot-rule-badge')?.textContent, '⏱', 'the first wins');
      assert.match(el.textContent, /late and also both set the badge of roof/);
    } finally {
      env.uninstall();
    }
  });
});

describe('rule_look_bands', () => {
  test('a bands rule tags each thing with its step, and the legend names each step drawn', async () => {
    const data = DATA.replace("status: 'late'})", "status: 'late', cost: 20})").replace(
      "status: 'done'})",
      "status: 'done', cost: 90})",
    );
    const bands = "// graph: work_style · STYLE work\n(cost:Look {bands: 'cost', steps: '50', means: 'Cost'})";
    const { env, el } = await card(noteOf(data, bands));
    try {
      assert.equal(node(el, 'roof').querySelector('.thoughtknot-rule-badge')?.textContent, '①');
      assert.equal(node(el, 'walls').querySelector('.thoughtknot-rule-badge')?.textContent, '②');
      assert.match(
        el.querySelector('.thoughtknot-rule-legend')?.textContent ?? '',
        /①\s*Cost: under 50.*②\s*Cost: 50 and over/s,
      );
    } finally {
      env.uninstall();
    }
  });
});

/** Shows block `n` of `note` as reading view does, read-only. */
async function readCard(env, note, n = 0) {
  const host = env.doc.body.createDiv({ cls: 'markdown-reading-view' });
  const el = host
    .createDiv({ cls: 'markdown-preview-view markdown-rendered' })
    .createDiv({ cls: 'block-language-gql' });
  const lines = note.split('\n'),
    fences = lines.flatMap((l, i) => (/^```gql/.test(l) ? [i] : []));
  const source = lines.slice(fences[n] + 1, lines.indexOf('```', fences[n] + 1)).join('\n');
  await env.state.processors.get('gql')(source, el, fakeContext(note, fences[n]));
  await until(() => !!el.querySelector('svg'));
  return el;
}
/** Opens the Rule form of the card in `el`, fills it as `rule` says, and sends it; gives what the form says. */
function makeRule(el, rule) {
  labelled(el, 'Rule').click();
  const form = el.querySelector('.thoughtknot-rule-form');
  assert.equal(form.hidden, false, 'the form opens');
  for (const [name, value] of Object.entries(rule)) form.querySelector(`[name="${name}"]`).value = value;
  form.dispatch('submit');
  return form;
}

describe('rule_look_try_save', () => {
  const DONE = { when: 'status == "done"', badge: 'check', means: 'Done' };

  test('in reading view a rule is tried at once, said not saved, and the note is left byte for byte', async () => {
    const note = noteOf(DATA, STYLE);
    const env = await load({ files: { [PATH]: note } });
    try {
      const el = await readCard(env, note);
      assert.equal(labelled(el, 'Rule').getAttribute('aria-expanded'), 'false');
      makeRule(el, DONE);
      await until(() => !!el.querySelector('.thoughtknot-rule-tried'));
      assert.equal(node(el, 'walls').querySelector('.thoughtknot-rule-badge')?.textContent, '✓', 'drawn at once');
      assert.match(el.querySelector('.thoughtknot-rule-legend').textContent, /✓\s*Done/, 'in the legend too');
      assert.match(el.querySelector('.thoughtknot-rule-tried').textContent, /not saved/);
      assert.equal(env.state.files.get(PATH), note, 'the note unchanged');
      labelled(el, 'Back to saved').click();
      await until(() => !el.querySelector('.thoughtknot-rule-tried') && !!el.querySelector('svg'));
      assert.equal(node(el, 'walls').querySelector('.thoughtknot-rule-badge'), null, 'the saved rules again');
      assert.equal(env.state.files.get(PATH), note);
    } finally {
      env.uninstall();
    }
  });

  test('where the note is edited the same rule is saved in the style graph', async () => {
    const note = noteOf(DATA, STYLE);
    const { env, el } = await card(note);
    try {
      makeRule(el, DONE);
      await until(() => /means: 'Done'/.test(env.state.files.get(PATH)));
      assert.match(env.state.files.get(PATH), /:Look \{when: 'status == "done"', badge: 'check', means: 'Done'\}/);
    } finally {
      env.uninstall();
    }
  });

  test('a rule told by colour alone, or with no test, says why and is neither tried nor saved', async () => {
    const note = noteOf(DATA, STYLE);
    const env = await load({ files: { [PATH]: note } });
    try {
      const el = await readCard(env, note);
      const form = makeRule(el, { when: 'status == "done"', means: 'Done' });
      assert.match(form.querySelector('.thoughtknot-rule-refused').textContent, /badge or a line/);
      form.querySelector('[name="when"]').value = '';
      form.querySelector('[name="badge"]').value = 'check';
      form.dispatch('submit');
      assert.match(form.querySelector('.thoughtknot-rule-refused').textContent, /needs a test/);
      assert.equal(el.querySelector('.thoughtknot-rule-tried'), null, 'nothing tried');
      assert.equal(env.state.files.get(PATH), note);
    } finally {
      env.uninstall();
    }
  });
});
