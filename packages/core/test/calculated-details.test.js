// A calculated value in the details (editor spec §57, calc_details_shown). It is marked as worked out, shows its
// expression, and has no field to change it. A gap, a loop or a refusal is said in words, never shown as zero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { calculatedDetails } from '../src/calculated-details.ts';
import { renderCalculated } from '../src/display/graph-view/calculated-rows.ts';

const node = (id, labels, props) => [id, [new Set(labels), { id, ...props }]];
const graph = (nodes, edges = []) => new gs.Graph(new Map(nodes), edges);
const DECL = node('c', ['Calculated'], { of: 'Task', name: 'cost', is: 'hours * rate', unit: 'USD' });
const UNITS = [
  node('qh', ['Quantity'], { of: 'Task', name: 'hours', unit: 'h' }),
  node('qr', ['Quantity'], { of: 'Task', name: 'rate', unit: 'USD/h' }),
];

/** A stand-in for an element that records what is made in it, so the rows can be read without a browser. */
function fake(tag = 'div', cls = '', text = '') {
  const el = { tag, cls, text, kids: [] };
  const make =
    (t) =>
    (o = {}) => {
      const k = fake(t, o.cls ?? '', o.text ?? '');
      el.kids.push(k);
      return k;
    };
  el.createDiv = make('div');
  el.createSpan = make('span');
  el.createEl = (t, o = {}) => make(t)(o);
  return el;
}
const all = (el) => [el, ...el.kids.flatMap(all)];

test('a calculated value shows its value, unit and expression', () => {
  const g = graph([DECL, ...UNITS, node('t', ['Task'], { hours: 2, rate: 10 })]);
  assert.deepEqual(calculatedDetails(g, 't'), [
    { name: 'cost', shown: '20 USD', expression: 'hours * rate', note: '' },
  ]);
});

test('a missing input is said in words, not shown as zero', () => {
  const g = graph([DECL, ...UNITS, node('t', ['Task'], { hours: 2 })]);
  const [row] = calculatedDetails(g, 't');
  assert.match(row.shown, /missing/);
  assert.doesNotMatch(row.shown, /^0/);
});

test('a loop names its things, and a refusal gives its reason', () => {
  const loop = graph([node('c', ['Calculated'], { of: 'Part', name: 'x', is: 'x + 1' }), node('a', ['Part'], {})]);
  assert.match(calculatedDetails(loop, 'a')[0].shown, /itself through a/);
  const bad = graph([node('c', ['Calculated'], { of: 'Part', name: 'x', is: 'now()' }), node('a', ['Part'], {})]);
  assert.match(calculatedDetails(bad, 'a')[0].shown, /calls "now"/);
});

test('a thing whose kind declares nothing has no calculated rows', () => {
  const g = graph([DECL, node('n', ['Note'], { hours: 1 })]);
  assert.deepEqual(calculatedDetails(g, 'n'), []);
});

test('the rows are marked as worked out and carry no field to edit', () => {
  const g = graph([DECL, ...UNITS, node('t', ['Task'], { hours: 2, rate: 10 })]);
  const parent = fake();
  renderCalculated(parent, g, 't');
  const texts = all(parent).map((e) => e.text);
  assert.ok(texts.includes('Worked out'), 'marked as worked out');
  assert.ok(texts.includes('20 USD'));
  assert.ok(
    texts.some((t) => t.includes('hours * rate')),
    'shows the expression',
  );
  assert.equal(
    all(parent).filter((e) => ['input', 'textarea', 'select'].includes(e.tag)).length,
    0,
    'no field to edit',
  );
  const empty = fake();
  renderCalculated(empty, g, 'zz');
  assert.equal(empty.kids.length, 0);
});
