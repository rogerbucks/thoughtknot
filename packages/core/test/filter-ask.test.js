// A filter asked for in words (editor spec §25, untangle_ask_filter). An AI's rule is read as a filter on things only:
// its kind and its tests, written back by the builder. It keeps what the rule engine finds. Shown, the rest fades, or
// hides if asked, and what the legend hides stays hidden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { ruleChoices } from '../src/rule-builder.ts';
import { blankFilter, filterKeeps, filterOfRule, filterReady, filterSaid, withAsked } from '../src/filter-ask.ts';

const G = readNote([
  [
    '// graph: work',
    "(roof:Task {name: 'Roof', status: 'late', cost: 80}),",
    "(walls:Task {name: 'Walls', status: 'done', cost: 20}),",
    "(sam:Person {name: 'Sam'}),",
    '(sam)-[:OWNS]->(roof), (roof)-[:NEEDS]->(walls)',
  ].join('\n'),
]).world.work;
const CHOICES = ruleChoices(G);
const BOXES = { boxes: ['roof', 'walls', 'sam'].map((key) => ({ key })) };
const EDGES = [
  { from: 'sam', to: 'roof', type: 'OWNS' },
  { from: 'roof', to: 'walls', type: 'NEEDS' },
];
const NONE = { forward: null, hidden: { things: new Set(), edges: new Set() } };

test('a rule on things becomes its kind and tests; one on links, a lens or no test is no filter', () => {
  assert.deepEqual(filterOfRule({ kind: 'Task', when: 'status == "late" and cost > 50', means: '' }), {
    on: 'things',
    of: 'Task',
    tests: [
      { field: 'status', op: 'is', value: 'late' },
      { field: 'cost', op: 'more', value: '50' },
    ],
  });
  assert.equal(filterOfRule({ type: 'NEEDS', when: 'weight == 3', means: '' }), null);
  assert.equal(filterOfRule({ lens: 'l1', means: '' }), null);
  assert.equal(filterOfRule({ when: 'status =~ "x"', means: '' }), null, 'only simple tests are read back');
});

test('it keeps what the rule engine finds, a kind alone too, and says it in plain words', () => {
  assert.equal(filterReady(blankFilter()), false);
  const late = { on: 'things', of: 'Task', tests: [{ field: 'status', op: 'is', value: 'late' }] };
  assert.deepEqual(filterKeeps(G, late, CHOICES), ['roof']);
  assert.deepEqual(filterKeeps(G, { ...blankFilter(), of: 'Person' }, CHOICES), ['sam']);
  assert.deepEqual(
    filterKeeps(G, { ...late, of: '', tests: [{ field: 'cost', op: 'least', value: '20' }] }, CHOICES).sort(),
    ['roof', 'walls'],
  );
  assert.equal(filterSaid(late), 'Task where status is late');
});

test('shown, the rest fades; hidden if asked; what the legend hides stays hidden', () => {
  assert.equal(withAsked(BOXES, EDGES, NONE, null), NONE);
  const faded = withAsked(BOXES, EDGES, NONE, { things: new Set(['roof', 'walls']), hide: false });
  assert.deepEqual([...faded.forward.things], ['roof', 'walls']);
  assert.deepEqual([...faded.forward.edges], [1]);
  assert.deepEqual([...faded.hidden.things], []);
  const hidden = withAsked(BOXES, EDGES, NONE, { things: new Set(['roof', 'walls']), hide: true });
  assert.deepEqual([...hidden.hidden.things], ['sam']);
  assert.deepEqual([...hidden.hidden.edges], [0]);
  const legend = { forward: null, hidden: { things: new Set(['walls']), edges: new Set([1]) } };
  const both = withAsked(BOXES, EDGES, legend, { things: new Set(['roof', 'walls']), hide: false });
  assert.deepEqual([...both.forward.things], ['roof']);
  assert.deepEqual([...both.hidden.things], ['walls']);
});
