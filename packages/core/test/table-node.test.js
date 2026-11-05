// A file drawn as one node whose content is the file (editor spec §67, format_content_node). A CSV is a table node.
// It shows its header, its first rows and a line counting the rest. It has a size every layout can place.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readCsv } from '../src/csv-read.ts';
import { DRAW_MARK_KINDS, drawMarksOf, marksBounds } from '../src/drawing-marks.ts';
import { placedTableNode, tableNode, TABLE_NODE_LIMIT } from '../src/table-node.ts';

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
