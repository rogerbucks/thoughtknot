// The axioms on generated graphs (editor spec §64; GS8). fast-check makes 2000 graphs from a fixed seed, so CI checks
// the same ones each run. axiom-graphs.mjs makes them.
// - axioms_on_generated_graphs: every generated graph keeps every axiom, and each break planted in one is found. A
//   planted break shrinks to a graph of at most two things, which names the axiom. The laws of the operations hold
//   too. Reading is a function (A4), and SAME_AS makes whole sets (A5). The join is order-free (A6). A derived value
//   equals a recompute (A9), and a clash is kept (A10).
// - axioms_safeguards: each check switched off, the test that it finds its planted break fails.
// python/graph_spec/tests/test_axioms.py runs the same laws on graphs its seeded generator makes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fc from 'fast-check';
import { RUNS, PLANTABLE, graph, text, worldOf, plant, joinDocs, docText, joined, shuffled } from './axiom-graphs.mjs';

const C = createRequire(import.meta.url)('../src/graph-spec-check.js');
const few = { ...RUNS, numRuns: 300 }; // for the slower laws, each run a join or several

/** The join's claim that document `doc` gave thing `id` the value `v`: its id names every document that gave it. */
const claimOf = (out, id, v, doc) =>
  Object.entries(out.claims).find(([k]) => {
    const m = /^claim:join\/([^/]+)\/v=([^@]+)@(.+)$/.exec(k);
    return m && m[1] === id && m[2] === String(v) && m[3].split('+').includes(doc.slice(4));
  })?.[1];

/** The property that the check finds a break of `axiom` planted in any generated graph, with checks `off`. */
const found = (axiom, off = []) =>
  fc.property(graph, (g) => {
    const problems = C.axioms(plant(g, axiom), g.name, { off });
    return problems.length > 0 && problems.every((p) => p.axiom === axiom);
  });

describe('axioms_on_generated_graphs', () => {
  test('every generated graph keeps every axiom', () => {
    fc.assert(
      fc.property(graph, (g) => {
        assert.deepEqual(C.axioms(worldOf(g), g.name), []);
      }),
      RUNS,
    );
  });

  for (const axiom of PLANTABLE)
    test(`${axiom}: a break planted in any graph is found, and names only ${axiom}`, () => {
      fc.assert(found(axiom), RUNS);
    });

  test('a planted break shrinks to a graph of at most two things, which names the axiom', () => {
    for (const axiom of PLANTABLE) {
      const run = fc.check(
        fc.property(graph, (g) => C.axioms(plant(g, axiom), g.name).length === 0),
        RUNS,
      );
      assert.ok(run.failed, `${axiom} is found`);
      const [g] = run.counterexample;
      assert.ok(g.things.length <= 2, `${axiom} shrinks to ${g.things.length} things`);
      assert.deepEqual([...new Set(C.axioms(plant(g, axiom), g.name).map((p) => p.axiom))], [axiom]);
    }
  });

  test('A4: the same text gives the same graph, and writing it out and reading it back changes nothing', () => {
    fc.assert(
      fc.property(graph, (g) => {
        const [one, two] = [worldOf(g), worldOf(g)];
        assert.equal(C.canon(one[g.name]), C.canon(two[g.name]));
        assert.ok(C.projectsBack(one[g.name], g.name));
      }),
      RUNS,
    );
  });

  test('A5: SAME_AS makes whole sets, each one connected piece of the links, in any order', () => {
    const links = fc.array(fc.tuple(fc.nat(5), fc.nat(5)), { maxLength: 8 });
    fc.assert(
      fc.property(links, fc.infiniteStream(fc.nat()), (pairs, order) => {
        const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
        const block = (ps) =>
          [
            '// graph: g',
            'INSERT',
            ids.map((i) => `(${i}:Item {id: '${i}'})`).join(', ') + (ps.length ? ',' : ''),
            ps.map(([x, y]) => `(${ids[x]})-[:SAME_AS]->(${ids[y]})`).join(',\n'),
          ].join('\n');
        const ones = (ps) => {
          const store = new C.Store();
          store.apply(block(ps));
          return C.sameAs(C.worldFromStore(store)).ones;
        };
        const sets = ones(pairs);
        // whole sets: no thing in two, and each link's two ends in one set
        const where = new Map();
        sets.forEach((s, i) => s.forEach((x) => (assert.ok(!where.has(x), `${x} is in one set`), where.set(x, i))));
        for (const [x, y] of pairs) assert.equal(where.get(`g/${ids[x]}`), where.get(`g/${ids[y]}`));
        // each set one connected piece: walking the links from its first member reaches every member
        for (const s of sets) {
          const reached = new Set([s[0]]);
          let grew = true;
          while (grew) {
            grew = false;
            for (const [x, y] of pairs) {
              const [a, b] = [`g/${ids[x]}`, `g/${ids[y]}`];
              if (reached.has(a) !== reached.has(b)) (reached.add(a), reached.add(b), (grew = true));
            }
          }
          assert.deepEqual([...reached].sort(), s);
        }
        // in any order, and each link either way round
        const it = order[Symbol.iterator]();
        const other = pairs.map((p) => (it.next().value % 2 ? [p[1], p[0]] : p)).sort(() => (it.next().value % 3) - 1);
        assert.deepEqual(ones(other), sets);
      }),
      RUNS,
    );
  });

  test('A6: the join is order-free and idempotent, and loses and invents nothing', () => {
    fc.assert(
      fc.property(
        joinDocs.chain((docs) => fc.tuple(fc.constant(docs), shuffled(docs))),
        ([docs, other]) => {
          const blocks = docs.map(docText);
          const answer = joined(blocks);
          assert.equal(joined(other.map(docText)), answer, 'in any order');
          assert.equal(joined([...blocks, ...blocks]), answer, 'each document twice');
          const out = JSON.parse(answer);
          const ids = new Set(docs.flatMap((d) => d.things.map((t) => t.id)));
          assert.deepEqual(Object.keys(out.nodes).sort(), [...ids].sort(), 'every thing, and no other');
          const links = new Set(docs.flatMap((d) => d.links.map(([a, b]) => C.jcs([a, 'OWNS', b, []]))));
          assert.deepEqual(Object.keys(out.edges).sort(), [...links].sort(), 'every link, and no other');
          for (const d of docs)
            for (const t of d.things)
              if (t.v !== undefined)
                assert.ok(
                  out.nodes[t.id][1].v === t.v || claimOf(out, t.id, t.v, d.id) !== undefined,
                  `${d.id}'s ${t.id}.v is kept, as asserted or claimed`,
                );
        },
      ),
      few,
    );
  });

  test('A9: what is derived from a graph equals a recompute from its own source', () => {
    fc.assert(
      fc.property(graph, (g) => {
        const world = worldOf(g);
        const [blocks, rels] = C.project(world[g.name]);
        const store = new C.Store();
        store.apply(C.rebuild(g.name, blocks, rels));
        const again = C.worldFromStore(store);
        assert.deepEqual(C.check(again, g.name), C.check(world, g.name));
        assert.equal(C.mermaidGraph(again[g.name]), C.mermaidGraph(world[g.name]));
        assert.equal(C.canon(again[g.name]), C.canon(world[g.name]));
      }),
      few,
    );
  });

  test('A10: a clash is kept as contested claims, and neither side is asserted', () => {
    fc.assert(
      fc.property(joinDocs, (docs) => {
        const out = JSON.parse(joined(docs.map(docText)));
        const said = new Map(); // thing -> the values its documents give it
        for (const d of docs)
          for (const t of d.things) if (t.v !== undefined) said.set(t.id, new Set([...(said.get(t.id) ?? []), t.v]));
        for (const [id, values] of said) {
          if (values.size < 2) continue;
          assert.equal(out.nodes[id][1].v, undefined, `${id}.v is not asserted`);
          for (const d of docs)
            for (const t of d.things.filter((x) => x.id === id && x.v !== undefined))
              assert.equal(claimOf(out, id, t.v, d.id)?.[0], 'contested');
        }
      }),
      few,
    );
  });
});

describe('axioms_safeguards', () => {
  for (const axiom of PLANTABLE)
    test(`${axiom}'s check switched off, the test that finds its break fails`, () => {
      assert.ok(fc.check(found(axiom), RUNS).failed === false, 'on, it passes');
      assert.ok(fc.check(found(axiom, [axiom]), RUNS).failed, 'off, it fails');
    });

  test('a block of the generated graphs reads as the reader writes it', () => {
    const [g] = fc.sample(graph, { seed: RUNS.seed, numRuns: 1 });
    assert.match(text(g), /^\/\/ graph: g\nINSERT\n/);
  });
});
