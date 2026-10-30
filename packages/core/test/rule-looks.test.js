// Rules and looks (editor spec §56). A look in the style graph may carry a `when`, or name a lens. Every thing or link
// its rule finds takes its look. Both run as lenses, so the JavaScript and Python engines agree. The shared cases are
// packages/graph-spec/test/rule-look-cases.json; python/graph_spec/tests/test_rule_looks.py holds Python to them.
// A rule's look is never colour alone and applies in the order written. A clash names both rules. Its legend is made
// from the style graph. The tests span rule-looks.ts and style-checks.ts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import gs from '@thoughtknot/graph-spec';
import { readNote } from '../src/drawing.ts';
import { readStyle, lookOf, legendOf } from '../src/style.ts';
import { BADGE_GLYPHS, lookToken, ruleLegend, ruleLooks, ruleThings } from '../src/rule-looks.ts';

const TASKS = `// graph: work
(late_work:Lens {name: 'Late work', query: 'Task WHERE status == "late"'}),
(t1:Task {name: 'Roof', status: 'late', cost: 120}),
(t2:Task {name: 'Walls', status: 'done', cost: 40}),
(t3:Task {name: 'Floor', status: 'late'}),
(ann:Person {name: 'Ann'}),
(t1)-[:NEEDS {weight: 3}]->(t2),
(t2)-[:NEEDS {weight: 1}]->(t3),
(ann)-[:OWNS]->(t1)`;

/** The note's blocks: graph work, and a style block of the given lines. */
const textsWith = (...lines) => [TASKS, ['// graph: work_style · STYLE work', ...lines].join('\n')];

/** The style of graph work read from the given style lines, with its problems and the graph as read. */
function styled(...lines) {
  const texts = textsWith(...lines);
  const reading = readNote(texts);
  const { style, problems } = readStyle(texts, 'work', reading);
  return { style, problems, graph: reading.world.work };
}

describe('rule_look_when', () => {
  const { cases } = JSON.parse(
    readFileSync(new URL('../../graph-spec/test/rule-look-cases.json', import.meta.url), 'utf8'),
  );
  /** The plain graph of a shared case. */
  const graphOf = (s) =>
    new gs.Graph(
      new Map(s.nodes.map(([id, labels, props]) => [id, [new Set(labels), { id, ...props }]])),
      s.edges.map(([a, t, b, p]) => [a, t, b, p || {}]),
    );
  for (const c of cases)
    test(`shared case: ${c.name}`, () => {
      assert.deepEqual(JSON.parse(JSON.stringify(gs[c.call](graphOf(c.graph), ...c.args))), c.expected);
    });

  test('a look with a when and a look naming a lens each give their look to exactly what the lens returns', () => {
    const { style, problems, graph } = styled(
      `(by_when:Look {when: 'status == "late"', kind: 'Task', badge: 'clock', means: 'Late'}),`,
      `(by_lens:Look {lens: 'late_work', line: 'dashed', means: 'In the late lens'})`,
    );
    assert.deepEqual(problems, []);
    const lens = gs.runLens(graph, 'late_work').things;
    assert.deepEqual(lens, ['t1', 't3']);
    const [byWhen, byLens] = style.looks;
    assert.deepEqual(ruleThings(graph, byWhen), lens);
    assert.deepEqual(ruleThings(graph, byLens), lens);
    const looks = ruleLooks(style, graph, 'work');
    assert.deepEqual([...looks.things.keys()], lens);
    assert.deepEqual(looks.things.get('t1'), {
      tokens: ['look.by-when', 'look.by-lens'],
      badge: 'clock',
      line: 'dashed',
      means: ['Late', 'In the late lens'],
    });
  });

  test('a rule on links gives its look to the links of its type whose properties pass its when', () => {
    const { style, problems, graph } = styled(
      `(heavy:Look {when: 'weight > 2', type: 'NEEDS', line: 'bold', means: 'Heavy need'})`,
    );
    assert.deepEqual(problems, []);
    const looks = ruleLooks(style, graph, 'work');
    assert.deepEqual([...looks.links.keys()], [0]);
    assert.equal(looks.links.get(0)?.line, 'bold');
    assert.equal(looks.things.size, 0);
  });

  test('a rule with no view or path holds in every drawing; one for a view only there', () => {
    const { style, graph } = styled(
      `(everywhere:Look {when: 'status == "done"', badge: 'check', means: 'Done'}),`,
      `(only_here:Look {view: 'plan', when: 'status == "late"', badge: 'clock', means: 'Late'})`,
    );
    assert.deepEqual([...ruleLooks(style, graph, 'work').things.keys()], ['t2']);
    assert.deepEqual([...ruleLooks(style, graph, 'work', { view: 'plan' }).things.keys()], ['t2', 't1', 't3']);
    // a rule's look finds its own things: the looks of one thing, kind or link never take it up
    assert.deepEqual(lookOf(style, { view: 'plan' }, { thing: 't1', kind: 'Task' }), {});
    assert.deepEqual(legendOf(style, { view: 'plan' }), []);
  });

  test('a when that cannot be read, or a lens the graph lacks, is a problem with its fix, and the rule is left out', () => {
    const { style, problems } = styled(
      `(bad_when:Look {when: 'status == ', badge: 'flag', means: 'Broken'}),`,
      `(bad_lens:Look {lens: 'late_wrok', badge: 'flag', means: 'Broken'}),`,
      `(both:Look {when: 'status == "late"', lens: 'late_work', badge: 'flag', means: 'Both'})`,
    );
    assert.deepEqual(style.looks, []);
    assert.equal(problems.length, 3);
    assert.match(problems[0].message, /this when cannot be read/);
    assert.match(problems[1].fix, /late_work/);
    assert.match(problems[2].message, /a when or names a lens, not both/);
  });
});

describe('rule_look_not_colour_alone', () => {
  test('a rule that sets only a colour is reported with a fix', () => {
    const { style, problems } = styled(`(red_only:Look {when: 'status == "late"', colour: 'red', means: 'Late'})`);
    assert.deepEqual(style.looks, []);
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /more than a colour/);
    assert.match(problems[0].fix, /badge/);
  });

  test('a rule says what it means, so the legend can show it', () => {
    const { style, problems } = styled(`(unsaid:Look {when: 'status == "late"', badge: 'clock'})`);
    assert.deepEqual(style.looks, []);
    assert.match(problems[0]?.message ?? '', /says what it means/);
  });

  test('every matched mark carries a style token and a second sign, never a colour value', () => {
    const { style, graph } = styled(
      `(late:Look {when: 'status == "late"', colour: 'red', badge: 'clock', means: 'Late'}),`,
      `(cheap:Look {when: 'cost < 50', line: 'dotted', means: 'Cheap'})`,
    );
    const looks = ruleLooks(style, graph, 'work');
    assert.deepEqual([...looks.things.keys()], ['t1', 't3', 't2']);
    for (const mark of looks.things.values()) {
      assert.ok(mark.tokens.length && mark.tokens.every((t) => /^look\.[a-z0-9-]+$/.test(t)), 'a token');
      assert.ok(mark.badge !== undefined || mark.line !== undefined, 'a second sign');
      // a hue is a named hue of the locked style, never a colour value
      for (const value of Object.values(mark).flat()) assert.doesNotMatch(String(value), /#|rgb|hsl|oklch/);
    }
    assert.equal(looks.things.get('t1')?.hue, 'red');
    assert.equal(BADGE_GLYPHS[looks.things.get('t1')?.badge ?? 'dot'], '⏱');
  });

  test('a badge is for a rule only', () => {
    const { problems } = styled(`(odd:Look {view: 'plan', thing: 't1', badge: 'flag'})`);
    assert.match(problems[0]?.message ?? '', /a badge is for a rule/);
  });
});

describe('rule_look_order', () => {
  test('two looks that set the outline of one thing give the first one and report a clash naming both', () => {
    const { style, problems, graph } = styled(
      `(late:Look {when: 'status == "late"', line: 'dashed', means: 'Late'}),`,
      `(dear:Look {when: 'cost > 100', line: 'bold', badge: 'up', means: 'Dear'})`,
    );
    assert.deepEqual(problems, []);
    const looks = ruleLooks(style, graph, 'work');
    const roof = looks.things.get('t1');
    assert.equal(roof?.line, 'dashed', 'the first written wins');
    assert.equal(roof?.badge, 'up', 'a part only the second sets is still given');
    assert.deepEqual(roof?.tokens, ['look.late', 'look.dear']);
    assert.equal(looks.clashes.length, 1);
    const [clash] = looks.clashes;
    assert.equal(clash.severity, 'warning');
    assert.equal(clash.code, 'GN808');
    assert.match(clash.message, /late and dear both set the line of t1; late is used/);
    assert.equal(clash.line, style.looks[1].at.line, 'said on the later rule');
  });

  test('a later rule that sets nothing new gives no token', () => {
    const { style, graph } = styled(
      `(late:Look {when: 'status == "late"', line: 'dashed', means: 'Late'}),`,
      `(also_late:Look {kind: 'Task', when: 'status == "late"', line: 'dotted', means: 'Late again'})`,
    );
    const looks = ruleLooks(style, graph, 'work');
    assert.deepEqual(looks.things.get('t3')?.tokens, ['look.late']);
    assert.equal(looks.clashes.length, 1, 'said once for the pair, not once for each thing');
  });
});

describe('rule_look_legend', () => {
  test('adding, changing or removing a rule changes the legend with no other edit', () => {
    const late = `(late:Look {when: 'status == "late"', colour: 'red', badge: 'clock', means: 'Late'})`;
    const one = ruleLegend(styled(late).style);
    assert.deepEqual(one, [
      { token: lookToken(styled(late).style.looks[0]), hue: 'red', badge: 'clock', means: 'Late' },
    ]);
    const two = ruleLegend(
      styled(`${late},`, `(cheap:Look {when: 'cost < 50', line: 'dotted', means: 'Cheap'})`).style,
    );
    assert.deepEqual(
      two.map((e) => e.means),
      ['Late', 'Cheap'],
    );
    const changed = ruleLegend(styled(late.replace("'Late'", "'Behind'")).style);
    assert.equal(changed[0]?.means, 'Behind');
    assert.deepEqual(ruleLegend(styled().style), []);
  });

  test("a view's legend holds the rules for every drawing and those for the view", () => {
    const { style } = styled(
      `(everywhere:Look {when: 'status == "done"', badge: 'check', means: 'Done'}),`,
      `(only_here:Look {view: 'plan', when: 'status == "late"', badge: 'clock', means: 'Late'})`,
    );
    assert.deepEqual(
      ruleLegend(style).map((e) => e.means),
      ['Done'],
    );
    assert.deepEqual(
      ruleLegend(style, { view: 'plan' }).map((e) => e.means),
      ['Done', 'Late'],
    );
  });
});
