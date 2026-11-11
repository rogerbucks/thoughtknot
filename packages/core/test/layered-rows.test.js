// The rows of our own engine keep the nudges a person writes (editor spec ES§6, nudges_kept_in_rows). Things beside
// each other share a row, and a thing before another sits in an earlier row, as Graphviz kept them. A drawing with no
// nudge is laid out in exactly the rows it was before.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nudgedRowsOf, rowsOf } from '../src/layouts/layered-rows.ts';
import { nudgesIn } from '../src/layouts/own-draw.ts';

const KEYS = ['home', 'park', 'cafe', 'lake'];
const at = (k) => (KEYS.includes(k) ? KEYS.indexOf(k) : undefined);
/** home → park → lake, and the cafe alone. */
const chain = () => [[1], [3], [], []];

describe('rows that keep the nudges (nudges_kept_in_rows)', () => {
  // proves: nudges_kept_in_rows
  test('with no nudge, they are the rows as before, links and all', () => {
    const [plain, nudged] = [chain(), chain()];
    assert.deepEqual(nudgedRowsOf(4, nudged, at), rowsOf(4, plain));
    assert.deepEqual(nudged, plain);
    assert.deepEqual(nudgedRowsOf(4, chain(), at, { same: [['home'], ['nobody', 'lake']], before: [] }), [0, 1, 0, 2]);
  });

  // proves: nudges_kept_in_rows
  test('things beside each other share a row, and a link between them is left out of the rows', () => {
    const links = chain();
    const rows = nudgedRowsOf(4, links, at, { same: [['home', 'cafe']], before: [] });
    assert.equal(rows[0], rows[2], 'home and the cafe share a row');
    assert.ok(rows[1] > rows[0] && rows[3] > rows[1], 'the chain still runs on');
    const sameRow = nudgedRowsOf(4, chain(), at, { same: [['park', 'lake']], before: [] });
    assert.equal(sameRow[1], sameRow[3]);
  });

  // proves: nudges_kept_in_rows
  test('a thing before another sits in an earlier row, and every link runs to a later row', () => {
    const links = chain();
    const rows = nudgedRowsOf(4, links, at, { same: [], before: [['lake', 'cafe']] });
    assert.ok(rows[2] > rows[3], 'the cafe comes after the lake');
    for (const [v, next] of links.entries()) for (const w of next) assert.ok(rows[v] < rows[w], `${v} -> ${w}`);
    // a nudge against the links is kept as a link turned round would be: the rows never loop
    const back = nudgedRowsOf(4, chain(), at, { same: [], before: [['lake', 'home']] });
    assert.equal(new Set(back).size > 1, true);
  });

  // proves: nudges_kept_in_rows
  test(
    'the nudges are read from the source, an unclosed quote at once (js/polynomial-redos)',
    { timeout: 10_000 },
    () => {
      const dot = '  {rank=same; "a \\"b\\""; "c";}\n  "c" -> "d" [style=invis];\n';
      assert.deepEqual(nudgesIn(dot), { same: [['a "b"', 'c']], before: [['c', 'd']] });
      const slow = `  {rank=same; "${'\\"!'.repeat(200_000)};}\n`;
      assert.deepEqual(nudgesIn(slow), { same: [[]], before: [] });
    },
  );
});
