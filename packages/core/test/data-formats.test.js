// Data formats (editor spec §67, DF1): the catalogue of formats and their roles, and what a read could not keep. A CSV
// or GraphML file ThoughtKnot exported reads back into the very graph exported, with no mapping (format_loss_stated).
// Every file is untrusted, and every format is read with code ThoughtKnot ships (format_text_first).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { connect, joinPlaces } from '../src/connectors.ts';
import { readGraphml } from '../src/graphml-read.ts';
import { document } from './docx-fixture.js';
import { workbook, zip } from './xlsx-fixture.js';
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

  test('a file is found by its extension, and the formats read by code ThoughtKnot ships say so', () => {
    // Word, PowerPoint, PDF, Excel and SQLite are read by code ThoughtKnot ships, as a text file is
    for (const [name, built] of [
      ['Word', 'document-connector.ts'],
      ['PowerPoint', 'board-pptx.ts'],
      ['PDF', 'document-connector.ts'],
      ['Excel', 'workbook-connector.ts'],
      ['SQLite', 'database-connector.ts'],
      ['GraphML', 'graphml-connector.ts'],
    ]) {
      const f = FORMAT_CATALOGUE.find((x) => x.name === name);
      assert.equal(f.reader, 'text', name);
      assert.deepEqual(f.source, { built }, name);
    }
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
  const graphml = dataText(exported, 'graphml', { note: 'G.md', date: '2026-11-05' });
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
  const readBack = (place, text) => {
    const c = connect(sourceOf(`// graph: g · FROM ${place}`), { found: place, text });
    const joined = joinPlaces('g', [c]);
    return { c, again: exportedData(joined.reading, exportScope(joined.reading, { graph: 'g' })) };
  };

  test('a CSV ThoughtKnot exported reads back into the very things and links exported, with no mapping', () => {
    const source = sourceOf('// graph: g · FROM Data/g.csv');
    const c = connect(source, { found: 'Data/g.csv', text: csv });
    assert.equal(c.proposal, undefined);
    const joined = joinPlaces('g', [c]);
    const again = exportedData(joined.reading, exportScope(joined.reading, { graph: 'g' }));
    assert.deepEqual(plain(again), plain(exported));
  });

  test('a GraphML file ThoughtKnot exported reads back into the very graph, each statement citing its line', () => {
    const { c, again } = readBack('Data/g.graphml', graphml);
    assert.equal(c.note, undefined, 'nothing was left out');
    assert.deepEqual(plain(again), plain(exported));
    const lines = graphml.split('\n');
    for (const s of c.statements) assert.match(lines[s.cite.line - 1], /^\s*<(node|edge)\b/);
  });

  test('a GraphML file from another tool says what it could not keep: drawing data, notes, both-way links', () => {
    const other = `<?xml version="1.0"?><graphml xmlns="http://graphml.graphdrawing.org/xmlns">
<key id="d0" for="node" attr.name="name" attr.type="string"/><key id="d1" for="node" yfiles.type="nodegraphics"/>
<graph id="G" edgedefault="undirected">
<!-- drawn by hand -->
<node id="a"><data key="d0">Ann</data><data key="d1"><y:Shape/></data></node>
<node id="b"><data key="d0">Bo</data></node>
<edge source="a" target="b"/><edge source="a" target="zz"/>
</graph></graphml>`;
    const r = readGraphml('x.graphml', other);
    assert.deepEqual(
      r.things.map(([id, , p]) => [id, p.name]),
      [
        ['a', 'Ann'],
        ['b', 'Bo'],
      ],
    );
    assert.deepEqual(r.links, [['a', 'LINKS_TO', 'b', {}]]);
    for (const lost of [/drawing data/, /both ways/, /comments/, /nodes the file does not hold/])
      assert.ok(
        r.dropped.some((d) => lost.test(d)),
        String(lost),
      );
    const c = connect(sourceOf('// graph: g · FROM x.graphml'), { found: 'x.graphml', text: other });
    assert.match(c.note, /^Left out of x\.graphml/);
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

describe('format_untrusted_files', () => {
  test('a macro, a link to another file and an embedded object are never run or fetched: the data reads alone', () => {
    const kept = globalThis.fetch;
    let fetched = 0;
    globalThis.fetch = () => (fetched++, Promise.reject(new Error('no')));
    try {
      const extra = {
        'xl/vbaProject.bin': 'Attribute VB_Name = "Auto_Open"\nShell "calc.exe"',
        'xl/externalLinks/externalLink1.xml': '<externalLink><externalBook r:id="rId1"/></externalLink>',
        'xl/externalLinks/_rels/externalLink1.xml.rels':
          '<Relationships><Relationship Id="rId1" Target="https://evil.example/x.xlsx" TargetMode="External"/></Relationships>',
        'xl/embeddings/oleObject1.bin': 'MZ',
      };
      const book = workbook({ S: [['id'], ['a']] }, { extra });
      const sheet = connect(sourceOf('// graph: g · FROM b.xlsm.xlsx#S'), { found: 'b.xlsx#S', bytes: book });
      assert.ok(!('refused' in sheet), sheet.refused);
      const doc = document(['Plain words.'], {
        extra: {
          'word/vbaProject.bin': 'Shell "calc.exe"',
          'word/_rels/document.xml.rels':
            '<Relationships><Relationship Id="r1" Target="https://evil.example/" TargetMode="External"/></Relationships>',
        },
      });
      const prose = connect(sourceOf('// graph: g · FROM d.docx'), { found: 'd.docx', bytes: doc });
      assert.equal(prose.prose, 'Plain words.');
      assert.equal(fetched, 0);
    } finally {
      globalThis.fetch = kept;
    }
    for (const file of ['xlsx-read.ts', 'docx-read.ts', 'pdf-read.ts', 'zip-read.ts', 'xml-scan.ts', 'graphml-read.ts'])
      assert.doesNotMatch(
        readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'),
        /\beval\(|new Function|\bfetch\(|import\(/,
        file,
      );
  });

  test('a zip bomb, an oversize sheet and an entity bomb are refused, each naming its reason', () => {
    const at = (place, fetched) => connect(sourceOf(`// graph: g · FROM ${place}`), { found: place, ...fetched });
    const bomb = zip({ 'xl/workbook.xml': 'x'.repeat(1000) }, { lie: -990 });
    assert.match(at('b.xlsx#S', { bytes: bomb }).refused, /damaged/);
    const rows = [['n'], ...Array.from({ length: 20_001 }, (_, i) => [i])];
    assert.match(at('b.xlsx#Big', { bytes: workbook({ Big: rows }) }).refused, /more than 20000 rows/);
    const laughs =
      '<?xml version="1.0"?><!DOCTYPE g [<!ENTITY a "aaaaaaaa"><!ENTITY b "&a;&a;&a;">]><graphml>&b;</graphml>';
    assert.match(at('l.graphml', { text: laughs }).refused, /l\.graphml is damaged or holds a document type/);
    assert.match(at('n.graphml', { text: '<html/>' }).refused, /not a GraphML file/);
  });
});

describe('format_text_first', () => {
  test('each format read is read by code ThoughtKnot ships: its reader imports no package from outside', () => {
    const read = new Set();
    const imports = (file) => {
      if (read.has(file)) return [];
      read.add(file);
      const code = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
      const from = [...code.matchAll(/^import[^;]*?from '([^']+)'/gms)].map((m) => m[1]);
      return from.flatMap((f) =>
        f.startsWith('./') && /(read|scan|connector)\.ts$/.test(f) ? [f, ...imports(f.slice(2))] : [f],
      );
    };
    for (const f of FORMAT_CATALOGUE) {
      const built = f.source && typeof f.source === 'object' ? f.source.built : null;
      if (!built || !built.endsWith('connector.ts')) continue;
      const outside = imports(built).filter((i) => !i.startsWith('./') && !i.startsWith('@thoughtknot/'));
      assert.deepEqual(outside, [], `${f.name} reads with ${outside.join(', ')}`);
    }
  });

  test('a format needing a reader library has no role built, and no reader library is accepted yet', () => {
    for (const f of FORMAT_CATALOGUE.filter((x) => x.reader === 'library'))
      for (const role of ['source', 'content', 'view', 'export'])
        assert.ok(
          !(f[role] && typeof f[role] === 'object'),
          `${f.name} ${role} is built before its library is accepted`,
        );
    const policy = readFileSync(new URL('../../../test/policy.test.js', import.meta.url), 'utf8');
    assert.match(policy, /const RUNTIME_ALLOWED = new Set\(\);/, 'adding a reader library is Roger’s call first');
  });
});
