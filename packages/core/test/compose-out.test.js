// Composing a graph out into a document (editor spec §67, format_compose_out): compose-out.ts. A graph composes to
// Markdown, HTML and a Word file. Each says what it left out, and the graph text is unchanged. Word is written with no
// library, as a stored zip of its XML parts (zip-write.ts).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { composeOut } from '../src/compose-out.ts';
import { COMPOSE_EXPORTS } from '../src/export-data.ts';
import { gqlSpans } from '../src/blocks.ts';
import { readNote } from '../src/drawing.ts';
import { exportedData } from '../src/export-data.ts';
import { pluginRegistry } from '../src/plugins.ts';
import { crc32, zipStored } from '../src/zip-write.ts';

const GRAPH = [
  '// graph: trip',
  "(ann:Person {name: 'Ann <the lead>', since: DATE '2026-03-01', active: true}),",
  "(bob:Person:Driver {name: 'Bob *bold*', age: 41}),",
  "(ann)-[:KNOWS {how: 'work'}]->(bob)",
].join('\n');
const NOTE = `# Trip\n\n\`\`\`gql\n${GRAPH}\n\`\`\`\n`;
const INFO = { note: 'Trip.md', date: '2026-11-12' };

function dataOf(note) {
  const reading = readNote(gqlSpans(note).map((s) => s.text));
  const drawing = reading.graphs.get('trip');
  return exportedData(reading, {
    kind: 'diagram',
    graph: 'trip',
    context: false,
    drawing,
    faded: { things: [], links: [] },
  });
}

/** The files of a stored zip, by path, each checked against its CRC-32. */
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map();
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    assert.equal(view.getUint16(at + 8, true), 0, 'stored, not compressed');
    const crc = view.getUint32(at + 14, true),
      size = view.getUint32(at + 18, true),
      nameLen = view.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLen));
    const body = bytes.subarray(at + 30 + nameLen, at + 30 + nameLen + size);
    assert.equal(crc32(body), crc, `${name}'s CRC-32`);
    files.set(name, new TextDecoder().decode(body));
    at += 30 + nameLen + size;
  }
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50, 'ends with the central directory');
  assert.equal(view.getUint16(bytes.length - 12, true), files.size);
  return files;
}

describe('a graph composed out (format_compose_out)', () => {
  test('as Markdown: a heading, each thing with its kinds and properties, its links, marks escaped', () => {
    const c = composeOut(dataOf(NOTE), 'md', INFO);
    assert.equal(c.extension, 'md');
    assert.match(c.body, /^# trip\n/);
    assert.match(c.body, /### Ann \\<the lead\\>/);
    assert.match(c.body, /### Bob \\\*bold\\\*\n\n_Person, Driver_\n\n- age: 41/);
    assert.match(c.body, /- since: 1 Mar 2026\n- active: yes/);
    assert.match(c.body, /- Ann \\<the lead\\> \*\*KNOWS\*\* Bob \\\*bold\\\* \(how: work\)/);
  });

  test('as HTML: escaped, with a policy that lets nothing run or load', () => {
    const c = composeOut(dataOf(NOTE), 'html', INFO);
    assert.equal(c.mime, 'text/html');
    assert.match(c.body, /<h3>Ann &lt;the lead&gt;<\/h3>/);
    assert.ok(!/<script|<img|<iframe|<form|<link /i.test(c.body), 'nothing that runs or fetches');
    assert.match(c.body, /Content-Security-Policy" content="default-src 'none'/);
  });

  test('as a Word file: a zip whose parts Word reads, with no library', () => {
    const c = composeOut(dataOf(NOTE), 'docx', INFO);
    assert.equal(c.extension, 'docx');
    const files = unzip(c.body);
    assert.deepEqual(
      [...files.keys()],
      ['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/styles.xml'],
    );
    const doc = files.get('word/document.xml');
    assert.match(doc, /<w:pStyle w:val="Title"\/><\/w:pPr><w:r><w:t xml:space="preserve">trip</);
    assert.match(doc, /Ann &lt;the lead&gt;/);
    assert.match(doc, /Ann &lt;the lead&gt; KNOWS Bob \*bold\* \(how: work\)/);
    // one graph gives one file, byte for byte
    assert.deepEqual(composeOut(dataOf(NOTE), 'docx', INFO).body, c.body);
  });

  test('each says what it left out, at its top and to the caller', () => {
    for (const format of ['md', 'html', 'docx']) {
      const c = composeOut(dataOf(NOTE), format, INFO);
      assert.ok(c.leftOut.includes('where things sit'));
      assert.ok(c.leftOut.some((l) => l.startsWith('which values are dates or numbers')));
      const text = typeof c.body === 'string' ? c.body : unzip(c.body).get('word/document.xml');
      assert.match(text, /Left out: the look of the drawing, where things sit/);
    }
  });

  test('the graph text is unchanged: composing only reads', () => {
    const before = NOTE;
    const data = dataOf(NOTE);
    const frozen = JSON.stringify(data);
    for (const format of ['md', 'html', 'docx']) composeOut(data, format, INFO);
    assert.equal(NOTE, before);
    assert.equal(JSON.stringify(data), frozen);
  });

  test('Markdown and HTML are export plug-ins, offered as any plug-in’s are', () => {
    const reg = pluginRegistry({ timeLimit: Infinity });
    reg.register(COMPOSE_EXPORTS);
    const md = reg.writeData('md', dataOf(NOTE), INFO);
    assert.ok(md.ok);
    assert.match(md.value, /^# trip/);
    assert.ok(reg.writeData('html', dataOf(NOTE), INFO).ok);
  });
});

describe('the zip writer', () => {
  test('gives the CRC-32 the zip format checks, and an empty zip for no files', () => {
    assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
    assert.equal(zipStored([]).length, 22);
    assert.throws(() => zipStored([{ path: '', bytes: new Uint8Array() }]), /needs a path/);
  });
});
