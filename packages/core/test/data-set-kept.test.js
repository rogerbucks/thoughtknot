// A data set kept linked or as a snapshot (editor spec §52, data_set_linked_or_kept). Linked is fetched again only
// when asked; a snapshot is a file beside the note that never changes on its own.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dataSetsOf } from '../src/data-set-reference.ts';
import { fetchWanted, keptOf, keptWords, linkEdit, snapshotEdit, snapshotPlace } from '../src/data-set-kept.ts';
import { readNote } from '../src/drawing.ts';

const kept = (note) => {
  const graph = readNote([note]).world['g'];
  return dataSetsOf(graph).map((ref) => keptOf(ref, graph.nodes.get(ref.id)[1]));
};
const LINKED = `// graph: g
(sales:DataSet {place: 'Data/sales.csv'})`;
const SNAPPED = `// graph: g
(sales:DataSet {place: 'Reports/Q3.sales.csv', kept: 'snapshot', from: 'Data/sales.csv', version: 'abc'})`;

describe('data_set_linked_or_kept', () => {
  test('a data set is linked unless its thing says it is a snapshot, and names where the snapshot came from', () => {
    assert.deepEqual(kept(LINKED), [{ id: 'sales', place: 'Data/sales.csv', kept: 'linked' }]);
    assert.deepEqual(kept(SNAPPED), [
      { id: 'sales', place: 'Reports/Q3.sales.csv', version: 'abc', kept: 'snapshot', from: 'Data/sales.csv' },
    ]);
  });

  test('a linked data set is fetched again only when asked, or when no copy is kept yet', () => {
    const [linked] = kept(LINKED);
    assert.equal(fetchWanted(linked, { cached: true, asked: false }), false);
    assert.equal(fetchWanted(linked, { cached: true, asked: true }), true);
    assert.equal(fetchWanted(linked, { cached: false, asked: false }), true);
  });

  test('a snapshot is never fetched: it changes only when a new one is taken', () => {
    const [snap] = kept(SNAPPED);
    for (const cached of [true, false])
      for (const asked of [true, false]) assert.equal(fetchWanted(snap, { cached, asked }), false);
    assert.match(keptWords(snap), /snapshot of Data\/sales\.csv.*never changes on its own/);
    assert.equal(keptWords(kept(LINKED)[0]), null);
  });

  test('a snapshot is a file beside the note, named for the note and the data set', () => {
    assert.equal(snapshotPlace('Reports/Q3.md', 'sales', 'Data/sales.csv'), 'Reports/Q3.sales.csv');
    assert.equal(snapshotPlace('Q3.md', 'orders', 'shop.sqlite'), 'Q3.orders.sqlite');
    assert.equal(snapshotPlace('Q3.md', 'raw', 'Data.v2/raw'), 'Q3.raw');
  });

  test('taking a snapshot points the thing at the copy and keeps where it came from; linking again undoes it', () => {
    const [linked] = kept(LINKED);
    const edit = snapshotEdit(linked, 'Reports/Q3.md', 'v9');
    assert.deepEqual(edit, { place: 'Reports/Q3.sales.csv', kept: 'snapshot', from: 'Data/sales.csv', version: 'v9' });
    const [snap] = kept(SNAPPED);
    assert.equal(snapshotEdit(snap, 'Reports/Q3.md', 'v10').from, 'Data/sales.csv', 'a new snapshot keeps the source');
    assert.deepEqual(linkEdit(snap), { place: 'Data/sales.csv', kept: null, from: null, version: null });
    assert.equal(linkEdit(linked), null);
  });
});
