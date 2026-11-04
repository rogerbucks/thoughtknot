// A graph as it was on a chosen day (editor spec §60, discover_as_at).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { asAtView } from '../src/as-at.ts';

const NOTE = `// graph: g
(old:Person {name: 'Old', recorded_at: DATE '2024-01-10'}),
(mid:Person {name: 'Mid', recorded_at: DATE '2024-06-01', valid_from: DATE '2024-01-01', valid_to: DATE '2024-08-01'}),
(late:Person {name: 'Late', recorded_at: DATE '2025-03-01'})`;
const graph = readNote([NOTE]).world.g;
const ids = (g) => [...g.nodes.keys()].sort();

test('the slider shows the graph true at the chosen day and lists the changes since', () => {
  // proves: discover_as_at
  const view = asAtView(graph, 'recorded', '2024-07-01', '2025-06-01');
  assert.deepEqual(ids(view.graph), ['mid', 'old']);
  assert.deepEqual(view.came, ['late']);
  assert.deepEqual(view.went, []);
  const real = asAtView(graph, 'real', '2024-03-01', '2025-06-01');
  assert.ok(real.graph.nodes.has('mid'), 'real-world time reads valid_from to valid_to');
  assert.deepEqual(real.went, ['mid'], 'mid no longer held by the later day');
});
