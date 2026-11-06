// The graph spec lists every format a graph is read from or written to (editor spec §51, spec_formats_listed).
// requirements/graph-spec-formats.json is the list. This holds the code to it. Every format the code offers is listed.
// Every named source file exists. Each format names a round-trip test that exists.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const LIST = JSON.parse(readFileSync(new URL('requirements/graph-spec-formats.json', root), 'utf8'));
const { DATA_FORMATS } = await import(new URL('packages/core/src/export-data.ts', root));
const { EXPORT_FORMATS } = await import(new URL('packages/core/src/export.ts', root));
const ids = LIST.formats.map((f) => f.id);

describe('spec_formats_listed', () => {
  test('every format the code writes as data or as a picture is in the list, once', () => {
    for (const id of [...DATA_FORMATS, ...EXPORT_FORMATS]) assert.ok(ids.includes(id), `${id} is listed`);
    assert.equal(new Set(ids).size, ids.length, 'no format is listed twice');
  });

  test('a format the list says the code reads or writes is the one the code names', () => {
    for (const f of LIST.formats) {
      if (f.code === 'DATA_FORMATS') assert.ok(DATA_FORMATS.includes(f.id), `${f.id} is in DATA_FORMATS`);
      else if (f.code === 'EXPORT_FORMATS') assert.ok(EXPORT_FORMATS.includes(f.id), `${f.id} is in EXPORT_FORMATS`);
      else assert.ok(existsSync(new URL(`packages/core/src/${f.code}`, root)), `${f.id}: ${f.code} exists`);
    }
  });

  test('each format says what it keeps and drops, and names a round-trip test that exists', () => {
    for (const f of LIST.formats) {
      assert.ok(f.keeps && f.drops, `${f.id} says what it keeps and drops`);
      assert.equal(typeof f.reads, 'boolean');
      assert.equal(typeof f.writes, 'boolean');
      assert.ok(existsSync(new URL(f.roundTrip, root)), `${f.id}: ${f.roundTrip} exists`);
    }
  });

  test('a format that reads and writes is round-tripped by a test that names it', () => {
    for (const f of LIST.formats.filter((x) => x.reads && x.writes)) {
      const text = readFileSync(new URL(f.roundTrip, root), 'utf8').toLowerCase();
      assert.ok(text.includes(f.id), `${f.roundTrip} names ${f.id}`);
    }
  });
});
