// Calculated values (editor spec §57): calc_in_schema, calc_by_tools, calc_gaps_said and calc_loops_flagged.
// The shared cases are in calculated-cases.json. python/graph_spec/tests/test_calculated.py holds the Python library
// to them, so the two engines give the same values (calc_engines_agree).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../src/graph-spec-check.js');
const { cases } = JSON.parse(readFileSync(new URL('./calculated-cases.json', import.meta.url), 'utf8'));

/** The plain graph of a shared case. */
const graphOf = (s) =>
  new C.Graph(
    new Map(s.nodes.map(([id, labels, props]) => [id, [new Set(labels), { id, ...props }]])),
    s.edges.map(([a, t, b, p]) => [a, t, b, p || {}]),
  );
const named = (start) => cases.find((c) => c.name.startsWith(start));
const run = (c) => JSON.parse(JSON.stringify(C[c.call](graphOf(c.graph), ...c.args)));

describe('calculated values', () => {
  for (const c of cases)
    test(c.name, () => {
      assert.deepEqual(run(c), c.expected);
    });

  test('calc_in_schema: a calculated property on one thing and a roll-up give the right value for every thing', () => {
    const { values } = run(named('a calculated property on one thing'));
    assert.deepEqual(
      ['t1', 't2', 't3'].map((t) => values[t].cost.value),
      [20, 15, 7],
    );
    assert.equal(values.p.total.value, 42);
    assert.equal(values.p.total.unit, 'USD');
  });

  test('calc_gaps_said: a total with three missing values says three are missing, never zero', () => {
    const { values } = run(named('a total with three missing'));
    assert.equal(values.p.total.value, 21);
    assert.equal(values.p.total.missing, 3);
  });

  test('calc_gaps_said: adding money to hours is refused naming both units', () => {
    const { values } = run(named('adding money to hours'));
    assert.equal(values.t1.bad.value, null);
    assert.match(values.t1.bad.refusal, /h and USD/);
  });

  test('calc_loops_flagged: a cycle names its things and the rest of the graph still works out', () => {
    const { values } = run(named('a roll-up through a cycle'));
    assert.deepEqual(values.a.total.loop, ['a', 'b']);
    assert.equal(values.a.total.value, null);
    assert.equal(values.c.total.value, 4);
    assert.equal(values.e.total.value, 20);
  });

  test('calc_by_tools: reading leaves the graph exactly as it was, and a stale cache is worked out again', () => {
    const c = named('a calculated property on one thing');
    const g = graphOf(c.graph);
    const before = JSON.stringify([[...g.nodes], g.edges]);
    C.calculate(g);
    assert.equal(JSON.stringify([[...g.nodes], g.edges]), before);
    assert.deepEqual(run(named('a cache whose input changed')), ['t|cost', 'zz|cost']);
    assert.deepEqual(run(named('a cache whose inputs are unchanged')), []);
  });

  test('a typed value is ignored: the calculated one wins', () => {
    const g = graphOf({
      nodes: [
        ['c', ['Calculated'], { of: 'Task', name: 'cost', is: 'hours * 2' }],
        ['t', ['Task'], { hours: 2, cost: 999 }],
      ],
      edges: [],
    });
    assert.equal(C.calculate(g).values.t.cost.value, 4);
  });

  test('names such as __proto__ in units, kinds and things never reach Object.prototype', () => {
    const g = graphOf({
      nodes: [
        ['c', ['Calculated'], { of: '__proto__', name: '__proto__', is: 'x * 2', unit: '__proto__' }],
        ['q', ['Quantity'], { of: '__proto__', name: 'x', unit: '__proto__' }],
        ['__proto__', ['__proto__'], { x: 2 }],
      ],
      edges: [],
    });
    const { values } = C.calculate(g);
    assert.equal(Object.getPrototypeOf(values), Object.prototype);
    assert.equal(Object.hasOwn(values, '__proto__'), true);
    assert.equal({}.polluted, undefined);
    assert.equal(Object.keys(Object.prototype).length, 0);
    assert.equal(values['__proto__']?.['__proto__']?.unit, '__proto__');
  });
});
