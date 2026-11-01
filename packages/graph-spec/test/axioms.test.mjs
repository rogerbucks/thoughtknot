// The graph spec's axioms (editor spec §64; GS8): src/axioms/axioms.js and the spec's §28.
// - axioms_listed: the spec lists each axiom once, with a plain sentence, a formal line and the rules it underpins.
//   Every rule it names exists, and the library's table says the same words.
// - axioms_cited: every rule rests on an axiom or says it stands alone, and every axiom underpins a rule.
// - axioms_checker: each break in axiom-cases.json is found under its code. It comes with its place, the axiom in its
//   words and a fix. A graph that keeps them all gives nothing, and a broken graph is still read and drawn.
//   python/graph_spec/tests/test_axioms.py answers the same cases.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../src/graph-spec-check.js');
const json = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const { cases } = json('./axiom-cases.json');
const TABLE = json('../src/axioms/axioms.json');
const PROBLEMS = json('../src/reader/problem-codes.json');
const DRAWING = json('../../core/src/drawing-problem-codes.json');

/** The spec's requirements graph, read by the library itself. */
function spec() {
  const store = new C.Store();
  store.apply(readFileSync(new URL('../../../requirements/graph-spec.gql', import.meta.url), 'utf8'));
  return C.worldFromStore(store).requirements;
}

/** The rows of the spec's §28 table: [id, name, plain, formal, rules], the rules as ids. */
function specTable() {
  const model = readFileSync(
    new URL('../../../python/graph_spec/conformance/Standards/Graph spec model.md', import.meta.url),
    'utf8',
  );
  const section = model.slice(model.indexOf('### 28. '), model.indexOf('## Examples'));
  return [...section.matchAll(/^\| (A\d+) \| ([^|]+) \| ([^|]+) \| `([^`]+)` \| ([^|]+) \|$/gm)].map((m) => [
    m[1],
    m[2],
    m[3],
    m[4],
    m[5].split(', ').map((r) => `req:${r}`),
  ]);
}

/** Each rule's axioms, from its rests_on: Map rule id -> [axiom ids], or [] for a rule with none. */
const restsOn = (g) =>
  new Map(g.labelled('Requirement').map((r) => [r, g.p(r).rests_on ? String(g.p(r).rests_on).split(', ') : []]));

/** A case's world: its blocks read, or its things and links made by hand. */
function worldOf(c) {
  if (c.blocks) {
    const store = new C.Store();
    for (const lines of c.blocks) store.apply(lines.join('\n'));
    return C.worldFromStore(store);
  }
  const world = Object.create(null);
  for (const [name, g] of Object.entries(c.graphs))
    world[name] = new C.Graph(
      new Map(g.nodes.map((n) => [n.key ?? n.props.id, [new Set(n.labels), n.props]])),
      g.links,
    );
  return world;
}

describe('axioms_listed', () => {
  const g = spec();
  const rows = specTable();

  test('the spec lists each axiom once, numbered, with a plain sentence, a formal line and its rules', () => {
    assert.deepEqual(
      rows.map((r) => r[0]),
      TABLE.axioms.map((a) => a.id),
    );
    for (const [id, name, plain, formal, rules] of rows)
      assert.ok(name && plain && formal && rules.length, `${id} has its words and its rules`);
    assert.ok(g.has('spec:§28', 'Section'), 'the requirements graph holds §28');
  });

  test("the library's table gives each axiom the spec's words, and a code of its own", () => {
    for (const [[id, name, plain, formal], t] of rows.map((r, i) => [r, TABLE.axioms[i]])) {
      assert.deepEqual([t.name, t.plain, t.formal], [name, plain, formal], id);
      assert.match(t.code, /^GA\d\d$/);
      assert.ok(['graph', 'generated'].includes(t.checked), `${t.id} says where it is checked`);
    }
    const codes = TABLE.axioms.map((a) => a.code);
    assert.equal(new Set(codes).size, codes.length, 'no two axioms share a code');
    const reader = new Set([...PROBLEMS.codes, ...DRAWING.codes].map((c) => c.code));
    assert.deepEqual(
      codes.filter((c) => reader.has(c)),
      [],
      "the readers' tables never take an axiom's code",
    );
    assert.deepEqual(
      C.AXIOMS.map((a) => a.id),
      TABLE.axioms.map((a) => a.id),
    );
  });

  test('every rule an axiom names is a rule of the spec that rests on it', () => {
    const rests = restsOn(g);
    const wrong = [];
    for (const [id, , , , rules] of rows) {
      for (const rule of rules) if (!(rests.get(rule) || []).includes(id)) wrong.push(`${id} names ${rule}`);
      const named = [...rests].filter(([, as]) => as.includes(id)).map(([r]) => r);
      for (const rule of named) if (!rules.includes(rule)) wrong.push(`${rule} rests on ${id}, which does not name it`);
    }
    assert.deepEqual(wrong, []);
  });
});

describe('axioms_cited', () => {
  const g = spec();
  const ids = new Set(TABLE.axioms.map((a) => a.id));

  test('every rule rests on axioms or says it stands alone, never both', () => {
    const wrong = [];
    for (const [rule, as] of restsOn(g)) {
      const alone = g.p(rule).stands_alone === true;
      if (as.length > 0 === alone) wrong.push(`${rule}: ${alone ? 'rests on an axiom and stands alone' : 'neither'}`);
      for (const a of as) if (!ids.has(a)) wrong.push(`${rule} rests on ${a}, which is no axiom`);
    }
    assert.deepEqual(wrong, []);
  });

  test('no axiom is named by no rule', () => {
    const named = new Set([...restsOn(g).values()].flat());
    assert.deepEqual(
      [...ids].filter((a) => !named.has(a)),
      [],
    );
  });

  test('a rule that names no axiom and is not marked is caught', () => {
    const store = new C.Store();
    store.apply(
      [
        '// graph: requirements',
        'INSERT',
        "(r1:Requirement {id: 'req:1.a', rests_on: 'A1'}),",
        "(r2:Requirement {id: 'req:1.b'}),",
        "(r3:Requirement {id: 'req:1.c', stands_alone: TRUE})",
      ].join('\n'),
    );
    const t = C.worldFromStore(store).requirements;
    const lone = [...restsOn(t)].filter(([r, as]) => !as.length && !t.p(r).stands_alone).map(([r]) => r);
    assert.deepEqual(lone, ['req:1.b']);
  });
});

describe('axioms_checker', () => {
  for (const c of cases)
    test(c.name, () => {
      assert.deepEqual(C.axioms(worldOf(c), c.graph), c.answer);
    });

  test('a graph that breaks an axiom is still read, checked and drawn', () => {
    const c = cases.find((x) => x.name.startsWith('A8'));
    const world = worldOf(c);
    assert.ok(C.axioms(world, c.graph).length > 0);
    assert.ok(Array.isArray(C.check(world, c.graph)));
    assert.match(C.mermaidGraph(world[c.graph]), /SUPERSEDES|supersedes/);
  });

  test("each problem's code and words come from the table, and every graph-checked axiom has a case", () => {
    const byId = new Map(TABLE.axioms.map((a) => [a.id, a]));
    const seen = new Set();
    for (const c of cases)
      for (const p of c.answer) {
        seen.add(p.axiom);
        assert.equal(p.code, byId.get(p.axiom).code);
        assert.equal(p.law, byId.get(p.axiom).plain);
      }
    assert.deepEqual(
      [...seen].sort(),
      TABLE.axioms
        .filter((a) => a.checked === 'graph')
        .map((a) => a.id)
        .sort(),
    );
  });
});
