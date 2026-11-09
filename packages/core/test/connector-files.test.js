// Files other than GQL broken into statements (editor spec §63, CN2). A CSV table is read by the mapping written beside
// it. Each statement cites its row, and a link its column. Plain text gives a proposal only, each change citing its
// line. Excel and SQLite follow (Roger, D1: CSV first).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { connect, joinPlaces } from '../src/connectors.ts';
import { mappingText, proposeMapping } from '../src/csv-mapping.ts';
import { readCsv } from '../src/csv-read.ts';
import { sourceOf } from '../src/sources.ts';
import { lineAt, proseProposal } from '../src/text-connector.ts';
import { settingsFrom } from '../src/settings.ts';
import { TEXT_MOST, textToGraphAsk } from '../src/text-to-graph.ts';

const PLACE = 'Data/sales.csv';
const CSV = 'order_id,amount,region,customer\r\nA1,12.5,North,Acme Ltd\r\nA2,8,South,Bolt\r\nA3,,North,Acme Ltd\r\n';
const MAPPING = mappingText({
  place: PLACE,
  row: 'Sale',
  columns: [
    { column: 'order_id', as: 'key' },
    { column: 'amount', as: 'measure', unit: 'GBP' },
    { column: 'region', as: 'dimension' },
    { column: 'customer', as: 'link', type: 'BOUGHT_BY', to: 'Customer' },
  ],
});
const source = sourceOf(`// graph: sales · FROM ${PLACE}`);
const fetched = (mapping) => ({ found: PLACE, text: CSV, ...(mapping ? { mapping } : {}) });

describe('connector_files_to_gql', () => {
  test('a block names a .csv table after FROM, and holds nothing of its own', () => {
    assert.equal(source.kind, 'table');
    assert.equal(source.target, PLACE);
    assert.ok('fault' in sourceOf(`// graph: sales · FROM ${PLACE}\n(a:Sale)`));
  });

  test('a CSV breaks into a statement per row and per link, each citing its row, and a link its column', () => {
    const c = connect(source, fetched(MAPPING));
    assert.deepEqual(
      c.statements.map((s) => s.text),
      [
        "(sale_A1:Sale {name: 'A1', order_id: 'A1', amount: 12.5, region: 'North'})",
        "(sale_A1)-[:BOUGHT_BY]->(customer_Acme_Ltd:Customer {name: 'Acme Ltd'})",
        "(sale_A2:Sale {name: 'A2', order_id: 'A2', amount: 8, region: 'South'})",
        "(sale_A2)-[:BOUGHT_BY]->(customer_Bolt:Customer {name: 'Bolt'})",
        "(sale_A3:Sale {name: 'A3', order_id: 'A3', region: 'North'})",
        "(sale_A3)-[:BOUGHT_BY]->(customer_Acme_Ltd:Customer {name: 'Acme Ltd'})",
      ],
    );
    assert.deepEqual(
      c.statements.map((s) => [s.cite.row, s.cite.line, s.cite.column]),
      [
        [1, 2, undefined],
        [1, 2, 'customer'],
        [2, 3, undefined],
        [2, 3, 'customer'],
        [3, 4, undefined],
        [3, 4, 'customer'],
      ],
    );
  });

  test('the joined graph cites each thing by its row, and two rows naming one customer give one thing', () => {
    const r = joinPlaces('sales', [connect(source, fetched(MAPPING))]);
    const keys = r.reading.graphs.get('sales').boxes.map((b) => b.key);
    assert.deepEqual(keys.sort(), ['customer_Acme_Ltd', 'customer_Bolt', 'sale_A1', 'sale_A2', 'sale_A3']);
    assert.match(r.cites.get('sale_A2')[0].place, /sales\.csv/);
    assert.equal(r.cites.get('sale_A2')[0].row, 2);
  });
});

describe('connector_mapping_written', () => {
  test('a first read proposes a mapping and draws nothing until a person saves it', () => {
    const c = connect(source, fetched());
    assert.deepEqual(c.statements, []);
    assert.equal(c.proposal.place, 'Data/sales.mapping.gql');
    assert.equal(c.proposal.text, mappingText(proposeMapping(PLACE, readCsv(PLACE, CSV))));
    assert.match(c.note, /no mapping yet/);
  });

  test('a later read uses the written mapping exactly, never a guess', () => {
    const proposed = connect(source, fetched()).proposal.text;
    const changed = proposed.replace("as: 'measure'", "as: 'skip'");
    const c = connect(source, fetched(changed));
    assert.equal(c.proposal, undefined);
    assert.ok(c.statements.every((s) => !s.text.includes('amount')));
  });
});

describe('connector_derived_kept_apart', () => {
  test('the same file and mapping always give the same statements, and the note holds only the FROM line', () => {
    const a = connect(source, fetched(MAPPING));
    const b = connect(source, fetched(MAPPING));
    assert.deepEqual(a.statements, b.statements);
    assert.equal(a.version, b.version);
    assert.equal(a.read.texts.length, 1);
  });
});

describe('connector_text_proposed', () => {
  const TXT = 'Notes/hiring.txt';
  const PROSE = 'Acme Ltd hired Alice Smith.\nShe now runs the Berlin office,\nwhich reports to the London office.\n';
  const NOTE = "# Hiring\n\n```gql\n// graph: org\n(acme:Company {name: 'Acme Ltd'})\n```\n";
  const ANSWER = JSON.stringify({
    things: [
      { name: 'alice', kind: 'Employee', text: 'Alice Smith', quote: 'Alice Smith' },
      { name: 'berlin', kind: 'Office', text: 'Berlin office', quote: 'the Berlin office' },
      { name: 'london', kind: 'Office', text: 'London office', quote: 'the London office' },
    ],
    links: [
      { from: 'alice', type: 'RUNS', to: 'berlin', quote: 'runs the Berlin office' },
      { from: 'berlin', type: 'REPORTS_TO', to: 'london', quote: 'reports to the London office' },
    ],
  });
  const textSource = sourceOf(`// graph: hiring · FROM ${TXT}`);

  test('a block names a .txt file after FROM, and the file gives no statement, only its text as prose', () => {
    assert.equal(textSource.kind, 'text');
    const c = connect(textSource, { found: TXT, text: PROSE });
    assert.deepEqual(c.statements, []);
    assert.equal(c.prose, PROSE);
    assert.equal(c.read.reading.graphs.get('hiring')?.boxes.length ?? 0, 0, 'nothing is drawn as fact');
    assert.match(c.note, /only as a proposal, each thing citing its line/);
    assert.equal(
      c.version,
      connect(textSource, { found: TXT, text: PROSE }).version,
      'the same text, the same version',
    );
  });

  test('a text-to-graph answer on the prose is a proposal whose every change cites the file and its line', () => {
    const r = proseProposal(NOTE, 'org', { place: TXT, text: PROSE }, ANSWER, 'Local');
    assert.ok('proposal' in r, JSON.stringify(r));
    const reasons = r.proposal.changes.map((c) => c.reason);
    assert.equal(reasons.length, 5);
    for (const reason of reasons) assert.match(reason, /^Notes\/hiring\.txt, line \d: "/);
    assert.ok(reasons.includes('Notes/hiring.txt, line 1: "Alice Smith"'));
    assert.ok(reasons.includes('Notes/hiring.txt, line 2: "the Berlin office"'));
    assert.ok(reasons.includes('Notes/hiring.txt, line 3: "reports to the London office"'));
    assert.deepEqual(r.proposal.provenance.by, { name: 'Local', kind: 'model' }, 'a proposal, never fact');
  });

  test('the send asked from a .txt card reads the answer with each change citing the file and its line', () => {
    const model = {
      name: 'Local',
      purpose: 'Proposing changes',
      ceiling: 'Internal',
      endpoint: '',
      model: 'm',
      keyName: '',
    };
    const settings = settingsFrom({ aiUse: 'on', aiPublic: 'note', aiModels: [model] });
    const base = { settings, model: 'Local', note: NOTE, notePath: 'Hiring.md', level: 'Internal' };
    const ask = textToGraphAsk(base, 'hiring', PROSE, '', TXT);
    assert.ok(!('refused' in ask), ask.refused);
    const changes = ask.answers.read(ANSWER, PROSE);
    assert.ok(Array.isArray(changes), JSON.stringify(changes));
    assert.ok(changes.map((c) => c.reason).includes('Notes/hiring.txt, line 2: "the Berlin office"'));
    const plain = textToGraphAsk(base, 'hiring', PROSE).answers.read(ANSWER, PROSE);
    assert.ok(
      plain.every((c) => !c.reason.startsWith(TXT)),
      'text with no file keeps its character span',
    );
  });

  test('an answer that quotes words the text does not hold is refused whole', () => {
    const bad = JSON.stringify({
      things: [{ name: 'bob', kind: 'Employee', text: 'Bob', quote: 'Bob Jones' }],
      links: [],
    });
    assert.ok('unread' in proseProposal(NOTE, 'org', { place: TXT, text: PROSE }, bad, 'Local'));
  });

  test('a text file longer than text to graph accepts is not read, and says so', () => {
    const r = connect(textSource, { found: TXT, text: 'x'.repeat(TEXT_MOST + 1) });
    assert.match(r.refused, /more than 50000 characters/);
  });

  test('a line is counted from 1 at each new line', () => {
    assert.deepEqual(
      [0, 5, 6, 12].map((at) => lineAt('ab\ncd\nef\ngh\n', at)),
      [1, 2, 3, 5],
    );
  });
});
