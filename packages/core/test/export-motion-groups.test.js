// The groups of a drawing, as the animated exports find them (risk SEC-21). A pattern over each group's body took time
// with the square of a long group left open, so the code scan counted it high. Plain search gives what it gave, and
// stays quick on text made to slow it.
// Requirements security_daily and security_release_gate: a slow pattern found by the code scan stops the nightly.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { replaceGroups } from '../src/export-motion.ts';

// The old pattern took seconds at these sizes. The test's own time limit fails a search that slows again.
const LIMIT = { timeout: 10_000 };

describe('the groups of a drawing are found by plain search, as their pattern found them (js/polynomial-redos)', () => {
  const tag = (all, open, kind, n, body, close) => `${open}[${kind} ${n}:${body}]${close}`;
  const old = (svg) =>
    svg.replace(/(<g id="(node|edge)(\d+)"[^>]*>)([\s\S]*?)(<\/g>)/g, (all, open, kind, n, body, close) =>
      tag(all, open, kind, n, body, close),
    );

  test('each group gives what the pattern gave', () => {
    for (const svg of [
      '<svg><g id="graph0"><g id="node1" class="node"><text>A</text></g><g id="edge12"><path d="M0"/></g></g></svg>',
      '<g id="node"></g><g id="nodex1"></g><g id="node1></g><g id="edge2" a="b">x</g>',
      '<g id="node1"><g id="node2">inner</g>rest</g><g id="node3">',
      '<g id="edge1"',
      '',
    ])
      assert.equal(replaceGroups(svg, ['node', 'edge'], tag), old(svg), svg);
    assert.equal(
      replaceGroups('<g id="node1">a</g><g id="edge2">b</g>', ['edge'], tag),
      '<g id="node1">a</g><g id="edge2">[edge 2:b]</g>',
    );
  });

  test('it keeps its time on text made to slow the pattern', LIMIT, () => {
    const many = (piece) => piece.repeat(60000);
    assert.equal(replaceGroups(many('<g id="edge1">'), ['edge'], tag), many('<g id="edge1">'));
    assert.equal(replaceGroups(many('<g id="node1"'), ['node', 'edge'], tag), many('<g id="node1"'));
    assert.equal(replaceGroups(many('<g id="edge1">a</g>'), ['edge'], tag).length, 60000 * 28);
  });
});
