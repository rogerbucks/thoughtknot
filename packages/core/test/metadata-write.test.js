// Writing metadata from Reading view (editor spec §3, reading_view_metadata and reading_view_metadata_safe). A layout or
// AI block is replaced where it is, or put right after its graph. Nothing else of the note changes. A write is refused
// when the graph changed since it was shown, or when it would touch any other line.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dataKind } from '../src/blocks.ts';
import { metaOf, metadataWrite, onlyMetadata } from '../src/metadata-write.ts';

const GRAPH = "// graph: trip\n(ann:Person {name: 'Ann'})";
const NOTE = `---\nstatus: draft\n---\n# Trip\n\nSome prose.\n\n\`\`\`gql\n${GRAPH}\n\`\`\`\n\nMore prose.\n`;
const LAYOUT = '// graph: trip_layout · LAYOUT ON trip\n(ann:Place {x: 1, y: 2})';
const AI = "// graph: trip_ai · AI ON trip\n(r1:Review {by: 'LM Studio', at: '2026-11-07'})";

describe('a metadata block', () => {
  test('is a layout or an AI block, known by its graph line, and never data to draw', () => {
    assert.deepEqual(metaOf(LAYOUT), { kind: 'LAYOUT', on: 'trip' });
    assert.deepEqual(metaOf(AI), { kind: 'AI', on: 'trip' });
    assert.equal(metaOf(GRAPH), null);
    assert.equal(dataKind(AI), null);
  });
});

describe('a write from Reading view (reading_view_metadata)', () => {
  test('puts a new block right after its graph, and leaves the graph, the prose and the properties as they were', () => {
    const r = metadataWrite(NOTE, 'trip', 'LAYOUT', LAYOUT, GRAPH);
    assert.ok('text' in r);
    assert.equal(r.text, NOTE.replace('```\n\nMore', `\`\`\`\n\n\`\`\`gql\n${LAYOUT}\n\`\`\`\n\nMore`));
    assert.ok(onlyMetadata(NOTE, r.text));
  });

  test('replaces a block already there in place, so a second write keeps one block', () => {
    const once = metadataWrite(NOTE, 'trip', 'AI', AI, GRAPH).text;
    const twice = metadataWrite(once, 'trip', 'AI', AI.replace('2026-11-07', '2026-11-08'), GRAPH).text;
    assert.equal((twice.match(/AI ON trip/g) ?? []).length, 1);
    assert.match(twice, /2026-11-08/);
    assert.equal(twice.split('\n').length, once.split('\n').length);
  });

  test('one undo is the note as it was: the text before the write', () => {
    const r = metadataWrite(NOTE, 'trip', 'LAYOUT', LAYOUT, GRAPH);
    assert.notEqual(r.text, NOTE);
    assert.ok(onlyMetadata(r.text, NOTE));
  });
});

describe('a write is refused, saying why (reading_view_metadata_safe)', () => {
  test('when the graph changed since it was shown', () => {
    const r = metadataWrite(NOTE, 'trip', 'LAYOUT', LAYOUT, "// graph: trip\n(bob:Person {name: 'Bob'})");
    assert.match(r.refused, /changed since it was shown/);
  });

  test('when the block is not the metadata it says, or the note has no such graph', () => {
    assert.match(metadataWrite(NOTE, 'trip', 'LAYOUT', GRAPH, GRAPH).refused, /more than the note’s metadata/);
    assert.match(metadataWrite(NOTE, 'trip', 'AI', LAYOUT, GRAPH).refused, /more than/);
    assert.match(metadataWrite(NOTE, 'trip', 'LAYOUT', LAYOUT.replace('ON trip', 'ON other'), GRAPH).refused, /more/);
    assert.match(metadataWrite(NOTE, 'gone', 'LAYOUT', LAYOUT, GRAPH).refused, /changed since/);
  });

  test('any change outside the front matter and metadata blocks counts as more than metadata', () => {
    assert.ok(!onlyMetadata(NOTE, NOTE.replace('Some prose', 'Other prose')));
    assert.ok(!onlyMetadata(NOTE, NOTE.replace("'Ann'", "'Anna'")));
    assert.ok(onlyMetadata(NOTE, NOTE.replace('status: draft', 'status: done')));
  });
});
