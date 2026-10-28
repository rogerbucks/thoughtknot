// Sync may merge only through the join (editor spec §64, axioms_before_sync; GS8). The CRDT transport (crdt_transport,
// Wave 13) will carry each device's documents to the others. Two devices that saw the same changes, in any order and
// some of them twice, must end with the same graph. That graph must be the plain join of the changes. fast-check
// makes the changes from a fixed seed (axiom-graphs.mjs), so CI checks the same ones each run.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { RUNS, joinDocs, docText, joined } from './axiom-graphs.mjs';

/** The order one device hears the documents in: each at least once, some again, as fast-check picks. */
const heard = (docs) =>
  fc
    .array(fc.nat(docs.length - 1), { maxLength: docs.length * 2 })
    .chain((repeats) => fc.shuffledSubarray([...docs.keys(), ...repeats], { minLength: docs.length + repeats.length }))
    .map((order) => order.map((i) => docs[i]));

describe('axioms_before_sync', () => {
  test('two devices fed the same changes, in shuffled orders with repeats, end with the same graph: the plain join', () => {
    fc.assert(
      fc.property(
        joinDocs.chain((docs) => fc.tuple(fc.constant(docs), heard(docs), heard(docs))),
        ([docs, one, two]) => {
          const plain = joined(docs.map(docText));
          assert.equal(joined(one.map(docText)), plain, 'the first device');
          assert.equal(joined(two.map(docText)), plain, 'the second device');
        },
      ),
      { ...RUNS, numRuns: 300 },
    );
  });

  test('a device that has heard only some of the changes is behind, never different in what it holds', () => {
    fc.assert(
      fc.property(
        joinDocs.filter((docs) => docs.length > 1),
        (docs) => {
          const some = JSON.parse(joined(docs.slice(0, -1).map(docText)));
          const all = JSON.parse(joined(docs.map(docText)));
          for (const id of Object.keys(some.nodes)) assert.ok(id in all.nodes, `${id} is still there`);
          for (const key of Object.keys(some.edges)) assert.ok(key in all.edges, `${key} is still there`);
        },
      ),
      { ...RUNS, numRuns: 300 },
    );
  });
});
