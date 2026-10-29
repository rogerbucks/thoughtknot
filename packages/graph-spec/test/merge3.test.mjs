// The three-way join of two revisions over their base (graph spec §21, same_join_every_author; CODE-2). Each branch
// the join takes has a case, written with its intended answer. The branches: both sides agree, one side changed, both
// changed differently, and a removal against a change with hold on and off. The cases are in merge3-cases.json, and
// python/graph_spec/tests/test_merge3.py holds the Python library to the same answers.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../src/graph-spec-check.js');
const { cases } = JSON.parse(readFileSync(new URL('./merge3-cases.json', import.meta.url), 'utf8'));

/** A document of `lines`, as a revision of the base unless it is the base. */
const block = (id, lines) =>
  [
    `// graph: shop · document ${id} · schema s1 · as of 2026-10-01${id === 'doc:base' ? '' : ' · revision of doc:base'}`,
  ]
    .concat(lines)
    .join('\n');

/** A case's answer in the cases' shape: its rows, contested claims, things and relationships. */
function answer(c) {
  const r = C.joinDocs({
    docs: [block('doc:a', c.a), block('doc:b', c.b)],
    base: block('doc:base', c.base),
    config: {},
    findings: [],
    ...(c.hold === undefined ? {} : { hold: c.hold }),
  });
  return {
    rows: r.rows.map((row) => row.slice(0, 3)),
    claims: Object.fromEntries(Object.entries(r.claims).map(([id, [status]]) => [id, status])),
    nodes: Object.fromEntries(Object.entries(r.nodes).map(([id, [, props]]) => [id, props])),
    edges: Object.keys(r.edges).map((key) => {
      const [from, type, to] = JSON.parse(key);
      return `${from}-${type}->${to}`;
    }),
  };
}

describe('merge3: every branch of the three-way join', () => {
  for (const c of cases)
    test(c.name, () => {
      assert.deepEqual(answer(c), c.answer);
    });

  test('the cases cover each branch: agree, one side, both differ, removal, and hold on and off', () => {
    const codes = new Set(cases.flatMap((c) => c.answer.rows.map(([code]) => code)));
    for (const code of ['both-same', 'one-side-change', 'both-differ', 'one-side-removal', 'delete-v-change'])
      assert.ok(codes.has(code), code);
    assert.ok(cases.some((c) => c.hold === true) && cases.some((c) => c.hold === false), 'hold on and off');
  });

  test('a join with no base is a union, not merge3: a removal on one side is not seen', () => {
    const [c] = cases.filter((x) => x.answer.rows.some(([code]) => code === 'one-side-removal'));
    const r = C.joinDocs({ docs: [block('doc:a', c.a), block('doc:b', c.b)], base: null, config: {}, findings: [] });
    assert.ok(!r.rows.some(([code]) => code === 'one-side-removal'));
  });
});
