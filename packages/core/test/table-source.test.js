// A data set drawn as its table in the drawing Graphviz lays out (editor spec §67, format_content_node). Its box shows
// the header, the first rows and a line counting the rest, and is sized to fit. The 3D view reads the same drawing.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { loadEngine } from '../src/engine.ts';
import { draw } from '../src/render.ts';
import { dataSetTables } from '../src/data-set-tables.ts';
import { tableRows, tableSource } from '../src/table-source.ts';

const NOTE = `// graph: g
(sales:DataSet {place: 'Data/sales.csv'})
(report:Note {name: 'Q3'})
(report)-[:USES]->(sales)`;
const header = ['order_id', 'customer', 'amount'];
const rows = Array.from({ length: 12 }, (_, i) => [`A${i + 1}`, i % 2 ? 'Bob' : 'Ann & Co', String(i)]);
const TABLE = { header, rows };

describe('format_content_node: a data set box shows its table', () => {
  test('the rows show the header, the first rows and the line counting the rest, escaped', () => {
    const shown = tableRows(TABLE);
    assert.match(shown, /<b>order_id<\/b>/);
    assert.match(shown, /A8</);
    assert.ok(!shown.includes('A9<'), 'only the first 8 rows');
    assert.match(shown, /Ann &amp; Co/);
    assert.match(shown, /12 rows · 4 more rows not shown/);
  });

  test('an empty table still shows its header and says it has no rows', () => {
    const shown = tableRows({ header, rows: [] });
    assert.match(shown, /<b>customer<\/b>/);
    assert.match(shown, /No rows yet/);
  });

  test('a source with no tables is left byte for byte', () => {
    const dot = '  "a" [label=<<table border="0"><tr><td>a</td></tr></table>>]';
    assert.equal(tableSource(dot, undefined), dot);
    assert.equal(tableSource(dot, [['b', TABLE]]), dot);
  });

  test('the drawn box holds the table and is bigger than without it', async () => {
    const engine = await loadEngine();
    const drawing = readNote([NOTE]).graphs.get('g');
    const sales = drawing.boxes.find((b) => b.id === 'sales' || b.key === 'sales' || b.label === 'sales');
    assert.ok(sales, 'the data set has a box');
    const plain = (await draw(drawing, engine)).svg;
    const tabled = (await draw({ ...drawing, tables: [[sales.key, TABLE]] }, engine)).svg;
    for (const text of ['order_id', 'A1', 'A8', '12 rows · 4 more rows not shown'])
      assert.ok(tabled.includes(text), text);
    assert.ok(!plain.includes('order_id'));
    const size = (svg) => svg.match(/viewBox="[^"]*"/)[0];
    assert.notEqual(size(tabled), size(plain), 'the drawing grows to fit the table');
  });
});

describe('format_content_node: each data set read from its place', () => {
  test('a graph gains the table of each data set it can read, by thing id', async () => {
    const graph = readNote([NOTE]).world['g'];
    const read = async (place) => (place === 'Data/sales.csv' ? 'order_id,amount\nA1,10\n' : null);
    assert.deepEqual(await dataSetTables(graph, read), [
      ['sales', { header: ['order_id', 'amount'], rows: [['A1', '10']] }],
    ]);
  });

  test('a place that cannot be read, or holds no table, shows none', async () => {
    const graph = readNote([NOTE]).world['g'];
    assert.deepEqual(await dataSetTables(graph, async () => null), []);
    assert.deepEqual(await dataSetTables(graph, async () => 'a\u0000b'), []);
    assert.deepEqual(await dataSetTables(undefined, async () => 'a\n1'), []);
  });
});
