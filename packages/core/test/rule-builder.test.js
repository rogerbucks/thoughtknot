// A rule built in plain words (editor spec §56, rule_look_builder). A person picks a property, a comparison and a value
// from lists the graph fills. The test is written from them, and said in words for the legend. A simple test is read
// back to change it. What a rule finds is counted as it is built. Quick starts come from the graph's own data.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { readStyle } from '../src/style.ts';
import { ruleChoices, ruleFinds, ruleStarts, sayDraft, testsOf, whenOf } from '../src/rule-builder.ts';
import { ruleRefusal, savedRules } from '../src/rule-write.ts';
import { ruleThings } from '../src/rule-looks.ts';

const TASKS = `// graph: work
(t1:Task {name: 'Roof', status: 'late', cost: 120}),
(t2:Task {name: 'Walls', status: 'done', cost: 40}),
(t3:Task {name: 'Floor', status: 'late', cost: 75}),
(ann:Person {name: 'Ann'}),
(t1)-[:NEEDS {weight: 3}]->(t2),
(t2)-[:NEEDS {weight: 1}]->(t3),
(ann)-[:OWNS]->(t1)`;
const graph = readNote([TASKS]).world.work;
const choices = ruleChoices(graph);
const field = (name) => choices.things.find((f) => f.name === name);

describe('rule_look_builder', () => {
  test('the lists are filled from the graph: its kinds, its link types, and each property with its values', () => {
    assert.deepEqual(choices.kinds, ['Person', 'Task']);
    assert.deepEqual(choices.types, ['NEEDS', 'OWNS']);
    assert.deepEqual(field('status'), { name: 'status', number: false, values: ['late', 'done'], groups: true });
    assert.equal(field('cost').number, true, 'a property of numbers may be compared by size');
    assert.equal(field('name').groups, false, 'a name sorts nothing into groups');
    assert.ok(field('links'), 'the count of links may always be tested');
    assert.deepEqual(choices.links[0], { name: 'weight', number: true, values: ['1', '3'], groups: false });
  });

  test('the test is written from the picks, numbers bare and text in quotes, and said in plain words', () => {
    const draft = {
      on: 'things',
      of: 'Task',
      tests: [
        { field: 'status', op: 'is', value: 'late' },
        { field: 'cost', op: 'more', value: '100' },
        { field: '', op: 'is', value: '' },
      ],
    };
    assert.equal(whenOf(draft, choices), 'status == "late" and cost > 100', 'a test not filled in is left out');
    assert.equal(sayDraft(draft), 'status is late and cost is more than 100');
    assert.equal(ruleRefusal({ when: whenOf(draft, choices), badge: 'flag', means: sayDraft(draft) }), null);
    const t1 = ruleThings(graph, { at: { block: 0, line: 0, id: 'x' }, when: whenOf(draft, choices), kind: 'Task' });
    assert.deepEqual(t1, ['t1'], 'it runs as every rule runs');
  });

  test('a simple test is read back into picks; anything else is left to be written by hand', () => {
    assert.deepEqual(testsOf('status == "late" and cost >= 50'), [
      { field: 'status', op: 'is', value: 'late' },
      { field: 'cost', op: 'least', value: '50' },
    ]);
    assert.equal(testsOf('status == "late" or cost > 5'), null);
    assert.equal(testsOf('(cost > 5)'), null);
  });

  test('what a rule finds is counted and named as it is built, on things or on links', () => {
    assert.deepEqual(ruleFinds(graph, { when: 'status == "late"', means: '' }), { count: 2, names: ['Roof', 'Floor'] });
    assert.deepEqual(ruleFinds(graph, { when: 'links == 0', means: '' }), { count: 0, names: [] });
    assert.deepEqual(ruleFinds(graph, { when: 'weight > 2', type: 'NEEDS', means: '' }), {
      count: 1,
      names: ['Roof NEEDS Walls'],
    });
    assert.deepEqual(ruleFinds(graph, { means: '' }), { count: 0, names: [] }, 'nothing to find with no test');
  });

  test('quick starts come from the graph: each value of a status-like property, then the lone and the most linked', () => {
    const starts = ruleStarts(choices);
    assert.deepEqual(
      starts.map((s) => s.means),
      ['status is late', 'status is done', 'Not linked to anything', 'Linked to 3 or more'],
    );
    for (const s of starts) {
      const rule = { when: whenOf(s.draft, choices), colour: s.colour, badge: s.badge, means: s.means };
      assert.equal(ruleRefusal(rule), null, `${s.means} can be tried as it is`);
    }
  });

  test('the rules saved with a test are listed to change, as they would be written again', () => {
    const texts = [
      TASKS,
      `// graph: work_style · STYLE work
(late:Look {when: 'status == "late"', colour: 'red', badge: 'clock', means: 'Late'}),
(cost:Look {bands: 'cost', steps: '50', means: 'Cost'})`,
    ];
    const { style } = readStyle(texts, 'work', readNote(texts));
    assert.deepEqual(savedRules(style.looks), [
      { means: 'Late', when: 'status == "late"', colour: 'red', badge: 'clock' },
    ]);
  });
});
