// A view's marks written as Graphviz writes a drawing (editor spec §68, projections_all_on): view-parts.ts. Each
// thing's marks are a node, numbered by where the graph writes it, and each link's an edge. So a card chooses and
// opens a thing in every view as it does in a network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewParts } from '../src/view-types/view-parts.ts';
import { hiveMarks } from '../src/view-types/hive-view.ts';
import { coreDiagrams } from '../src/core-diagrams.ts';
import { pluginRegistry } from '../src/plugins.ts';

const shape = {
  things: ['ada', 'bea', 'cy'].map((key) => ({ key, text: key.toUpperCase(), kinds: ['Person'] })),
  links: [
    { from: 'ada', type: 'MANAGES', to: 'bea' },
    { from: 'ada', type: 'MANAGES', to: 'cy' },
    { from: 'ada', type: 'KNOWS', to: 'bea' },
  ],
};
const SPACE = { width: 400, height: 300 };

// proves: projections_all_on
test('each thing is a node and each link an edge, numbered as the graph writes them', () => {
  const marks = hiveMarks({ shape, space: SPACE });
  const parts = viewParts(marks, shape);
  assert.equal(parts[0].kind, 'graph', 'the drawing’s own marks first, such as its axes');
  assert.ok(parts[0].marks.some((id) => id.startsWith('spoke\n')));
  const nodes = parts.filter((p) => p.kind === 'node');
  assert.deepEqual(
    nodes.map((p) => [p.id, p.title]),
    [
      ['node1', 'ada'],
      ['node2', 'bea'],
      ['node3', 'cy'],
    ],
  );
  assert.ok(nodes[0].marks.includes('ada') && nodes[0].marks.includes('ada\nlabel'), 'its box and its name');
  const edges = parts.filter((p) => p.kind === 'edge');
  assert.deepEqual(
    edges.map((p) => p.id),
    ['edge1', 'edge2', 'edge3'],
    'two links between the same things are two edges',
  );
  const all = parts.flatMap((p) => p.marks);
  assert.equal(all.length, marks.length, 'every mark once');
});

// proves: projections_all_on
test('a view’s picture holds its things and links as Graphviz’s parts', async () => {
  const registry = pluginRegistry();
  registry.register(coreDiagrams());
  const r = await registry.drawDiagram('thoughtknot.diagrams.hive', shape, SPACE);
  assert.ok(r.ok, r.message);
  assert.match(r.value, /<g id="node2" class="node">\n<ellipse[^>]*\/>\n<text[^>]*>BEA<\/text>/);
  assert.match(r.value, /<g id="edge3" class="edge">/);
});
