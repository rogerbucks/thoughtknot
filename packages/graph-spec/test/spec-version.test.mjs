// The Graph Spec version a block is written to (editor spec §51, spec_version_in_files). A block may name it on its
// graph line, as '· spec 1.0'. The reader reads its own major, an older one, or none named. It refuses a newer major
// with GN107 and a fix that says to upgrade. The cases are shared with the Python reader
// (python/graph_spec/tests/test_spec_version.py).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const gs = createRequire(import.meta.url)('../src/graph-spec-check.js');
const CASES = JSON.parse(readFileSync(new URL('./spec-version-cases.json', import.meta.url), 'utf8'));

describe('spec_version_in_files', () => {
  for (const c of CASES.cases)
    test(c.name, () => {
      const store = new gs.Store();
      if (c.code) {
        assert.throws(
          () => store.apply(c.block),
          (e) => e.code === c.code && /newer than this reader/.test(e.message) && /upgrade/.test(e.fix),
        );
        return;
      }
      store.apply(c.block);
      assert.equal(store.graph('g').nodes.size, c.things);
    });

  test('the refusal says which spec the block is written to and which this reader implements', () => {
    assert.throws(
      () => new gs.Store().apply('// graph: g · spec 2.5\n(a:T)'),
      (e) => e.message.includes('Graph Spec 2.5') && e.message.includes(`Graph Spec ${CASES.implements}`),
    );
  });
});
