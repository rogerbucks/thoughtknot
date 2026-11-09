// Reading a layout source, the DOT the core writes, with no Graphviz (editor spec §53, layout_own_engine).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readDot, DotError } from '../src/layouts/dot-read.ts';

describe('reading a layout source', () => {
  test('reads defaults, things, links, chains and groups inside groups', () => {
    const g = readDot(
      'digraph G { node [shape=box]; subgraph cluster_a { label=<A>; a; subgraph cluster_b { b; } } { rank=same; c; } a -> b -> c [label="x"]; }',
    );
    assert.equal(g.directed, true);
    assert.deepEqual(
      g.nodes.map((n) => [n.key, n.attrs.shape]),
      [
        ['a', 'box'],
        ['b', 'box'],
        ['c', 'box'],
      ],
    );
    assert.deepEqual(
      g.edges.map((e) => [e.tail, e.head, e.attrs.label]),
      [
        ['a', 'b', 'x'],
        ['b', 'c', 'x'],
      ],
    );
    assert.deepEqual(
      g.groups.map((x) => [x.name, x.members, x.groups.map((y) => y.name)]),
      [['cluster_a', ['a', 'b'], ['cluster_b']]],
    );
  });

  test('refuses what is not DOT', () => {
    assert.throws(() => readDot('digraph G { a -> '), DotError);
  });
});
