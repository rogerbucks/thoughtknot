// Data formats (editor spec §67, DF1): the catalogue of formats and their roles, and what a read could not keep. A CSV
// ThoughtKnot exported reads back into the very graph exported, with no mapping (format_loss_stated).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { connect, joinPlaces } from '../src/connectors.ts';
import { FORMAT_CATALOGUE, formatOf } from '../src/data-formats.ts';
import { readNote } from '../src/drawing.ts';
import { dataText, exportedData } from '../src/export-data.ts';
import { exportScope } from '../src/export-scope.ts';
import { sourceOf } from '../src/sources.ts';

const NAMED = ['Markdown', 'Mermaid', 'CSV', 'JSON', 'Excel', 'Word', 'PowerPoint', 'PDF', 'Images', 'GraphML'];
const NAMED_TOO = ['DOT', 'GEXF', 'OPML', 'SQLite', 'Cypher', 'GQL'];

describe('format_catalogue', () => {
  test('lists every format the spec names, each with its four roles', () => {
    const names = FORMAT_CATALOGUE.map((f) => f.name);
    for (const name of [...NAMED, ...NAMED_TOO]) assert.ok(names.includes(name), name);
    for (const f of FORMAT_CATALOGUE)
      for (const role of ['source', 'content', 'view', 'export']) assert.ok(role in f, `${f.name} ${role}`);
  });

  test('each built role names the code that does it, and that code is there', () => {
    for (const f of FORMAT_CATALOGUE)
      for (const role of ['source', 'content', 'view', 'export']) {
        const state = f[role];
        if (state && typeof state === 'object')
          assert.ok(existsSync(new URL(`../src/${state.built}`, import.meta.url)), `${f.name} ${role}`);
      }
  });

  test('a format needing a reader library says so, and a file is found by its extension', () => {
    for (const name of ['Excel', 'Word', 'PowerPoint', 'PDF'])
      assert.equal(FORMAT_CATALOGUE.find((f) => f.name === name).reader, 'library', name);
    assert.equal(formatOf('Data/Sales.CSV').name, 'CSV');
    assert.equal(formatOf('notes.txt'), undefined);
  });
});

describe('format_loss_stated', () => {
  const BLOCK = `// graph: g
(ann:Person {name: 'Ann', age: 41, ok: TRUE, born: DATE '1984-03-02', seen: DATETIME '2026-01-02T03:04:05Z', motto: '=1+1', blank: ''}),
(thing_x:Place {id: 'two words', size: -0}),
(ann)-[:LIVES_IN {since: 2020}]->(thing_x)`;
  const reading = readNote([BLOCK]);
  const exported = exportedData(reading, exportScope(reading, { graph: 'g' }));
  const csv = dataText(exported, 'csv', { note: 'G.md', date: '2026-11-05' });

  test('a CSV ThoughtKnot exported reads back into the very things and links exported, with no mapping', () => {
    const source = sourceOf('// graph: g · FROM Data/g.csv');
    const c = connect(source, { found: 'Data/g.csv', text: csv });
    assert.equal(c.proposal, undefined);
    const joined = joinPlaces('g', [c]);
    const again = exportedData(joined.reading, exportScope(joined.reading, { graph: 'g' }));
    // the same graph: each thing and link with the same kinds and values, dates still dates; order and citations aside
    const value = (v) => (typeof v === 'object' ? `${v.kind} ${v.s}` : Object.is(v, -0) ? '-0' : v);
    const props = (p) =>
      Object.entries(p)
        .filter(([k]) => k !== 'cited_from' && k !== 'id')
        .map(([k, v]) => [k, value(v)])
        .sort();
    const plain = (d) => ({
      things: d.things.map(([id, kinds, p]) => [id, kinds, props(p)]),
      links: d.links.map(([from, type, to, p]) => [from, type, to, props(p)]),
    });
    assert.deepEqual(plain(again), plain(exported));
  });

  test('each statement read back cites the row it was on', () => {
    const c = connect(sourceOf('// graph: g · FROM Data/g.csv'), { found: 'Data/g.csv', text: csv });
    assert.deepEqual(
      c.statements.map((s) => s.cite.row),
      [1, 2, 3],
    );
  });

  test('a view’s faded context is read as the rest is, and the read says the fading was not kept', () => {
    const faded = csv.replace('\r\nthing,', '\r\nfaded thing,');
    const c = connect(sourceOf('// graph: g · FROM Data/g.csv'), { found: 'Data/g.csv', text: faded });
    assert.equal(c.statements.length, 3);
    assert.match(c.note, /faded/);
  });

  test('a table with more cells than its header says the extra cells are left out', () => {
    const MAPPING = `// graph: mapping
(t:DataSet {place: 'Data/t.csv', row: 'Row'})
(c:Column {name: 'a', as: 'key', at: 1})
(t)-[:COLUMN]->(c)`;
    const c = connect(sourceOf('// graph: t · FROM Data/t.csv'), {
      found: 'Data/t.csv',
      text: 'a\n1,extra\n2',
      mapping: MAPPING,
    });
    assert.match(c.note, /extra cells are left out/);
  });
});

describe('format_untrusted_files and format_text_first, for CSV', () => {
  test('a CSV is read with the code ThoughtKnot ships, and one too large is refused with its reason', () => {
    const big = `a\n${'1\n'.repeat(20_002)}`;
    const r = connect(sourceOf('// graph: t · FROM Data/t.csv'), { found: 'Data/t.csv', text: big });
    assert.equal(r.why, 'unreadable');
    assert.match(r.refused, /Data\/t\.csv has more than 20000 rows/);
  });
});
