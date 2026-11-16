// A file drawn as one node whose content is the file (editor spec §67, format_content_node). A CSV is a table node.
// It shows its header, its first rows and a line counting the rest. It has a size every layout can place. A sheet
// and a database table are table nodes too. A text file, a Word document or a PDF is a page.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readCsv } from '../src/csv-read.ts';
import { DRAW_MARK_KINDS, drawMarksOf, marksBounds } from '../src/drawing-marks.ts';
import initSqlJs from 'sql.js';
import { dataSetTables, nodeTableOf, readAsBytes } from '../src/data-set-tables.ts';
import { readNote } from '../src/drawing.ts';
import { placedTableNode, tableNode, TABLE_NODE_LIMIT } from '../src/table-node.ts';
import { document } from './docx-fixture.js';
import { pdf } from './pdf-fixture.js';
import { workbook } from './xlsx-fixture.js';

const SPACE = { width: 2000, height: 2000 };
const rows = (n) => Array.from({ length: n }, (_, i) => `${i + 1},Item ${i + 1},${(i + 1) * 10}`).join('\n');
const read = (text) => {
  const t = readCsv('Data/sales.csv', text);
  assert.ok(!('refused' in t), 'the CSV is read');
  return t;
};
const texts = (node) => node.marks.filter((m) => m.kind === 'label').map((m) => m.text);

describe('format_content_node', () => {
  test('a CSV draws as one table node: one box holding its header and its rows', () => {
    const node = tableNode('sales', 'Data/sales.csv', read(`id,name,amount\n${rows(3)}`));
    const boxes = node.marks.filter((m) => m.kind === 'box' && m.of === 'sales');
    assert.equal(boxes.length, 1, 'one thing');
    assert.equal(drawMarksOf(node.marks, SPACE).length, node.marks.length, 'every mark is one a painter takes');
    for (const t of ['Data/sales.csv', 'id', 'name', 'amount', 'Item 1', 'Item 3', '30', '3 rows'])
      assert.ok(texts(node).includes(t), t);
    assert.deepEqual(node.more, { rows: 0, columns: 0 });
  });

  test('a table past the limit shows its first rows and a count of the rest', () => {
    const node = tableNode('sales', 'Data/sales.csv', read(`id,name,amount\n${rows(50)}`));
    assert.equal(node.more.rows, 50 - TABLE_NODE_LIMIT.rows);
    assert.ok(texts(node).includes(`Item ${TABLE_NODE_LIMIT.rows}`));
    assert.ok(!texts(node).includes(`Item ${TABLE_NODE_LIMIT.rows + 1}`));
    assert.match(texts(node).at(-1), /50 rows · 42 more rows not shown/);
    const wide = tableNode('w', 'w.csv', { header: 'abcdefghij'.split(''), rows: [] }, { rows: 8, columns: 4 });
    assert.equal(wide.more.columns, 6);
  });

  test('the node reports a size that holds all it draws, and a long cell is cut, never spilling over', () => {
    const long = 'x'.repeat(400);
    const node = tableNode('t', 't.csv', read(`id,note\n1,${long}`));
    assert.ok(node.width > 0 && node.height > 0);
    assert.ok(node.width < 1000, 'a long cell does not make the node wide');
    assert.ok(
      texts(node).some((t) => t.endsWith('…')),
      'the long cell is cut with an ellipsis',
    );
    for (const m of node.marks)
      if (m.kind === 'label') assert.ok(m.x + (m.maxWidth ?? 0) <= node.width + 1e-9, `${m.id} fits across`);
    const placed = placedTableNode(node, 500, 300);
    const b = marksBounds(placed);
    const near = (a, e) => assert.ok(Math.abs(a - e) < 1e-6, `${a} is ${e}`);
    near(b.x, 500 - node.width / 2);
    near(b.y, 300 - node.height / 2);
    near(b.width, node.width);
    near(b.height, node.height);
  });

  test('an empty table is never a blank node: its header shows and it says it has no rows', () => {
    const node = tableNode('e', 'e.csv', read('id,name\n'));
    assert.ok(texts(node).includes('id'));
    assert.equal(texts(node).at(-1), 'No rows yet');
  });

  test('its marks are kinds every painter draws, in 2D and in 3D alike, with nothing format-specific', () => {
    const node = tableNode('sales', 'Data/sales.csv', read(`id,name,amount\n${rows(3)}`));
    for (const m of node.marks) assert.ok(['box', 'label'].includes(m.kind) && DRAW_MARK_KINDS.includes(m.kind), m.id);
    for (const m of node.marks) assert.match(m.style, /^(thing|label)(\.|$)/, `${m.id} takes a theme's paint`);
  });
});

describe('format_content_node: a sheet, a database table and a page', () => {
  let SQL;
  before(async () => {
    SQL = await initSqlJs();
  });
  const sheet = workbook({ Sales: [['id', 'name'], ...Array.from({ length: 12 }, (_, i) => [`a${i}`, `Item ${i}`])] });

  test('a sheet of a workbook and a table of a database draw as table nodes, past the limit counting the rest', () => {
    const fromSheet = nodeTableOf('Data/book.xlsx#Sales', sheet);
    const db = new SQL.Database();
    db.exec("CREATE TABLE orders (id TEXT, total REAL); INSERT INTO orders VALUES ('o1', 2.5), ('o2', NULL);");
    const fromDb = nodeTableOf('Data/shop.sqlite#orders', db.export());
    db.close();
    assert.deepEqual(fromSheet.header, ['id', 'name']);
    assert.match(texts(tableNode('s', 'Data/book.xlsx#Sales', fromSheet)).at(-1), /^12 rows · 4 more rows not shown$/);
    assert.deepEqual(fromDb, {
      header: ['id', 'total'],
      rows: [
        ['o1', '2.5'],
        ['o2', ''],
      ],
    });
    assert.equal(nodeTableOf('Data/book.xlsx#Missing', sheet), null, 'a sheet it does not hold shows no table');
  });

  test('a text file, a Word document and a PDF draw as a page: first lines, then a count of the rest', () => {
    const lines = Array.from({ length: 11 }, (_, i) => `Line ${i + 1} of the plan.`);
    for (const [place, file] of [
      ['Notes/plan.txt', `${lines.join('\n')}\n\n`],
      ['Data/plan.docx', document(lines)],
    ]) {
      const page = nodeTableOf(place, file);
      assert.equal(page.page, true, place);
      assert.equal(page.rows.length, 11, place);
      const node = tableNode('p', place, page);
      assert.ok(texts(node).includes('Line 1 of the plan.'), place);
      assert.equal(texts(node).at(-1), '11 lines · 3 more lines not shown', place);
    }
    const fromPdf = nodeTableOf('Data/plan.pdf', pdf([['Grow steadily.']]));
    assert.ok(fromPdf.rows.some(([l]) => l === 'Grow steadily.'));
    assert.equal(texts(tableNode('e', 'e.txt', nodeTableOf('e.txt', ''))).at(-1), 'No text in it', 'never blank');
  });

  test('a page line is given the room of a few columns, and a long one is cut, never spilling over', () => {
    const long = 'word '.repeat(40).trim();
    const node = tableNode('p', 'p.txt', nodeTableOf('p.txt', long));
    const line = node.marks.find((m) => m.id === 'p#1:0');
    assert.ok(line.maxWidth > 30 * 7, 'wider than a table cell');
    assert.ok(line.x + line.maxWidth <= node.width, 'held inside the node');
    for (const m of node.marks) assert.ok(DRAW_MARK_KINDS.includes(m.kind), 'marks every painter draws, 2D and 3D');
  });

  test('the host is asked for bytes for a workbook, database or document, and for text otherwise', async () => {
    assert.deepEqual(['b.xlsx#S', 'c.sqlite#t', 'd.docx', 'e.pdf', 'f.csv', 'g.txt'].map(readAsBytes), [
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
    const graph = readNote(["// graph: g\n(s:DataSet {place: 'Data/book.xlsx#Sales'}), (n:DataSet {place: 'n.txt'})"])
      .world['g'];
    const asked = [];
    const got = await dataSetTables(graph, async (place) => (asked.push(place), readAsBytes(place) ? sheet : 'Hello.'));
    assert.deepEqual(
      got.map(([id, t]) => [id, Boolean(t.page)]),
      [
        ['s', false],
        ['n', true],
      ],
    );
    assert.deepEqual(asked, ['Data/book.xlsx#Sales', 'n.txt']);
  });
});
