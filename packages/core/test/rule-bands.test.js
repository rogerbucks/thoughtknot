// A bands rule (editor spec §56, rule_look_bands). A number is shaded in steps, with the palette's colours in order,
// cool to warm. Each step also gets a numbered tag, so it is never told by colour alone. The legend names each step.
// Each step runs as a lens query, so both engines find the same things. The tests span rule-looks.ts and
// rule-words.ts; rule-look-checks.test.js checks how a bands rule is written.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { readStyle } from '../src/style.ts';
import { bandSteps, ruleLegend, ruleLooks, rulesFor } from '../src/rule-looks.ts';
import { BAND_HUES, bandHues } from '../src/rule-words.ts';

const TASKS = `// graph: work
(t1:Task {name: 'Roof', cost: 20}),
(t2:Task {name: 'Walls', cost: 50}),
(t3:Task {name: 'Floor', cost: 99}),
(t4:Task {name: 'Door', cost: 400}),
(t5:Task {name: 'Paint'}),
(t1)-[:NEEDS]->(t2)`;

/** The style of graph work read from the given style lines, with its problems and the graph as read. */
function styled(...lines) {
  const texts = [TASKS, ['// graph: work_style · STYLE work', ...lines].join('\n')];
  const reading = readNote(texts);
  const { style, problems } = readStyle(texts, 'work', reading);
  return { style, problems, graph: reading.world.work, drawing: reading.graphs.get('work') };
}

describe('rule_look_bands', () => {
  test('a bands rule gives each thing the step its number falls in, and the legend names each step', () => {
    const { style, problems, graph } = styled(`(cost_bands:Look {bands: 'cost', steps: '50, 100', means: 'Cost'})`);
    assert.deepEqual(problems, []);
    const looks = ruleLooks(style, graph, 'work');
    const step = (key) => looks.things.get(key)?.tokens[0];
    assert.equal(step('t1'), 'look.cost-bands.1');
    assert.equal(step('t2'), 'look.cost-bands.2', 'a number on a step starts it');
    assert.equal(step('t3'), 'look.cost-bands.2');
    assert.equal(step('t4'), 'look.cost-bands.3');
    assert.equal(looks.things.has('t5'), false, 'a thing with no number is in no step');
    assert.deepEqual(
      ['t1', 't2', 't4'].map((k) => looks.things.get(k)?.hue),
      ['blue', 'yellow', 'red'],
      "the palette's colours in order, cool to warm",
    );
    assert.deepEqual(
      ['t1', 't2', 't4'].map((k) => looks.things.get(k)?.tag),
      ['①', '②', '③'],
      'a numbered tag beside each colour',
    );
    assert.deepEqual(
      ruleLegend(style).map((e) => [e.tag, e.means]),
      [
        ['①', 'Cost: under 50'],
        ['②', 'Cost: 50 to under 100'],
        ['③', 'Cost: 100 and over'],
      ],
    );
  });

  test('each step runs as a lens query of the number', () => {
    const { style } = styled(`(cost_bands:Look {bands: 'cost', steps: '50', kind: 'Task', means: 'Cost'})`);
    assert.deepEqual(
      bandSteps(style.looks[0]).map((s) => s.when),
      ['cost < 50', 'cost >= 50'],
    );
  });

  test('a card shows only the steps something drawn falls in', () => {
    const { style, graph, drawing } = styled(`(cost_bands:Look {bands: 'cost', steps: '10, 30, 1000', means: 'Cost'})`);
    const shown = rulesFor(style, graph, drawing);
    assert.deepEqual(
      shown.legend.map((e) => e.tag),
      ['②', '③'],
    );
  });

  test('steps spread over the ordered colours, so the first is coolest and the last warmest', () => {
    assert.deepEqual(bandHues(2), ['blue', 'red']);
    assert.deepEqual(bandHues(BAND_HUES.length), [...BAND_HUES]);
  });
});
