// The relationships view as Mermaid draws written groups (clusters, editor spec §31) as subgraphs, with their members
// inside (wiki/Mermaid-mapping-review.md, gap G1). Python's twin must write the same text on the shared cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { mermaidGraph, Graph } = require('../src/graph-spec-check.js');
const { cases } = JSON.parse(readFileSync(new URL('./mermaid-group-cases.json', import.meta.url), 'utf8'));

/** The plain graph of a shared case. */
const graphOf = (c) =>
  new Graph(
    new Map(c.nodes.map(([id, labels]) => [id, [new Set(labels), { id }]])),
    c.edges.map(([s, t, d]) => [s, t, d, {}]),
  );

for (const c of cases)
  test(`the shared case "${c.name}" gives its recorded Mermaid text`, () => {
    assert.equal(mermaidGraph(graphOf(c)), c.expected);
  });
