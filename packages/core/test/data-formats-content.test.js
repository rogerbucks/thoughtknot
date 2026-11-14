// A table that is both a node and a graph (editor spec §67, format_graph_from_data, format_any_layout; DF1).
// - A CSV is drawn as a table node and, through its written mapping, as things and links. Each row links to its things.
// - Every layout, built in or brought by a format, places a graph and a content node together, knowing no format.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mappingText, proposeMapping } from '../src/csv-mapping.ts';
import { readCsv } from '../src/csv-read.ts';
import { formatLayouts, registerFormat } from '../src/data-formats-plugins.ts';
import { nodeIdOf, tableViews } from '../src/data-formats-content.ts';
import { LAYOUTS } from '../src/layouts/layouts.ts';

const TEXT = 'id,name,owner\nc1,Acme,Ann\nc2,Beta,Bob\nc3,Gamma,Ann\n';
const source = { graph: 'sales', kind: 'table', target: 'Data/customers.csv', block: 0 };
// the mapping a person writes beside the file: here the one the editor proposes, with the owner column a link
const proposed = proposeMapping('Data/customers.csv', readCsv('Data/customers.csv', TEXT));
const MAPPING = mappingText({
  ...proposed,
  columns: proposed.columns.map((c) => (c.column === 'owner' ? { ...c, as: 'link' } : c)),
});

let remove = () => {};
afterEach(() => remove());

describe('format_graph_from_data', () => {
  test('a CSV is a table node and, through its mapping, things and links; each row links to what it gave', () => {
    const v = tableViews(source, TEXT, MAPPING);
    assert.ok(!('refused' in v), JSON.stringify(v));
    assert.equal(v.id, nodeIdOf('Data/customers.csv'));
    assert.ok(v.node.width > 0 && v.node.height > 0 && v.node.marks.length > 0, 'the node draws');
    assert.ok(v.graph.statements.length > 0, 'and gives things and links');
    assert.match(v.version, /^[0-9a-f]{64}$/);
    for (const s of v.graph.statements) assert.equal(s.cite.version, v.version);
    const byRow = (n) => v.rows.filter((r) => r.row === n).map((r) => r.to);
    assert.equal(v.rows.length > 0, true);
    for (const r of v.rows) assert.equal(r.from, v.id);
    assert.deepEqual(byRow(1), ['customers_c1', 'owner_Ann'], 'row 1 gave its thing and its owner');
    assert.deepEqual(byRow(2), ['customers_c2', 'owner_Bob']);
    assert.ok(!byRow(2).includes('owner_Ann'), "and row 2 did not give row 1's owner");
  });

  test('with no mapping the node still draws, the graph is empty, and a mapping is proposed', () => {
    const v = tableViews(source, TEXT);
    assert.ok(v.node.marks.length > 0);
    assert.deepEqual(v.graph.statements, []);
    assert.deepEqual(v.rows, []);
    assert.ok(v.graph.proposal);
  });

  test('a file that cannot be read is refused with the reason', () => {
    const r = tableViews(source, 'a\n"open');
    assert.match(r.refused, /never closed/);
  });
});

describe('format_any_layout', () => {
  test('every layout places the graph and the content node together, and the node reports its size', () => {
    remove = registerFormat({
      format: 'Row',
      extensions: ['row'],
      layouts: [{ id: 'row', dims: 2, place: (shape) => new Map(shape.things.map((t, i) => [t.key, [i * 100, 0]])) }],
    });
    const v = tableViews(source, TEXT, MAPPING);
    const keys = [v.id, ...new Set(v.rows.map((r) => r.to))];
    const shape = {
      things: keys.map((key) => ({ key, text: key, kinds: ['Thing'] })),
      links: v.rows.map((r) => ({ from: r.from, type: 'ROW', to: r.to })),
    };
    const layouts = [...LAYOUTS, ...formatLayouts()];
    assert.ok(layouts.length > LAYOUTS.length, 'a format brought one');
    for (const layout of layouts) {
      const spots = layout.place(shape);
      assert.deepEqual([...spots.keys()].sort(), [...keys].sort(), `${layout.id} places every key`);
      assert.equal(spots.get(v.id).length, layout.dims, `${layout.id} places the node in ${layout.dims}D`);
    }
    assert.ok(Number.isFinite(v.node.width) && Number.isFinite(v.node.height));
  });
});
