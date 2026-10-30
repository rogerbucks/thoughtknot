// Rules and looks on a card (editor spec §56). Each thing or link a style rule finds is drawn with its look: the rule's
// style token, its line, and its badge beside its name. A screen reader hears what the rule means. The legend lists
// each rule drawn with its badge and meaning. A view's card draws the rules for every drawing and its own. Two rules
// that set one part of a thing are a clash, listed with the card's problems.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load } from './host/load-plugin.js';
import { fence } from './host/notes.js';
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
