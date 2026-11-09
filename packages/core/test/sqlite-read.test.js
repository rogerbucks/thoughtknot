// A SQLite database read as tables in plain JavaScript (editor spec §63 connector_files_to_gql, §67
// format_untrusted_files). The files here are made by sql.js, the engine the plug-in used before, so each is a real
// SQLite file. The reader itself runs no engine and no WebAssembly.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import { columnsOf, sqliteEntries, sqliteTable, SQLITE_LIMITS } from '../src/sqlite-read.ts';

let SQL;
before(async () => {
  SQL = await initSqlJs();
});

/** A database file made by running `sql`, with the page size given. */
function made(sql, pageSize = 4096) {
  const db = new SQL.Database();
  db.exec(`PRAGMA page_size = ${pageSize}; VACUUM;`);
  db.exec(sql);
  const bytes = db.export();
  db.close();
  return bytes;
}

describe('sqlite_read_tables', () => {
  test('lists tables and views, and reads a table of every kind of value', () => {
    const bytes = made(`
      CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT, age INT, score REAL, photo BLOB, note TEXT);
      INSERT INTO people VALUES (1, 'Alice Smith', 34, 1.5, x'00ff', NULL);
      INSERT INTO people VALUES (7, 'Bob', -300000, 0, NULL, 'two''s');
      INSERT INTO people VALUES (9, 'Zoë', 9007199254740993, -2.25, NULL, '');
      CREATE VIEW adults AS SELECT * FROM people WHERE age > 18;
    `);
    const entries = sqliteEntries(bytes);
    assert.deepEqual(
      entries.map((e) => [e.name, e.unread ?? '']),
      [
        ['adults', 'adults is a view: only tables are read. Save the view as a table in the database to read it.'],
        ['people', ''],
      ],
    );
    const t = sqliteTable(bytes, 'people');
    assert.deepEqual(t.columns, ['id', 'name', 'age', 'score', 'photo', 'note']);
    assert.deepEqual(t.rows[0], [1, 'Alice Smith', 34, 1.5, new Uint8Array([0, 255]), null]);
    assert.deepEqual(t.rows[1], [7, 'Bob', -300000, 0, null, "two's"]);
    assert.deepEqual(t.rows[2], [9, 'Zoë', '9007199254740993', -2.25, null, '']);
  });

  test('reads a table over many pages, with text spilling onto overflow pages, in rowid order', () => {
    const long = 'x'.repeat(3000);
    const rows = Array.from({ length: 400 }, (_, i) => `(${i + 1}, '${i}-${long}')`).join(',');
    const bytes = made(
      `CREATE TABLE notes (n INTEGER PRIMARY KEY, body TEXT); INSERT INTO notes VALUES ${rows};`,
      1024,
    );
    const t = sqliteTable(bytes, 'notes');
    assert.equal(t.rows.length, 400);
    assert.deepEqual(t.rows[399], [400, `399-${long}`]);
    assert.ok(t.rows.every((r, i) => r[0] === i + 1));
  });

  test('a column added later reads as nothing in older rows; a table-level INTEGER key is the rowid', () => {
    const bytes = made(`
      CREATE TABLE "odd name" (k INTEGER, [label] TEXT, PRIMARY KEY (k));
      INSERT INTO "odd name" VALUES (5, 'five');
      ALTER TABLE "odd name" ADD COLUMN extra TEXT;
      INSERT INTO "odd name" VALUES (6, 'six', 'more');
    `);
    const t = sqliteTable(bytes, 'odd name');
    assert.deepEqual(t.columns, ['k', 'label', 'extra']);
    assert.deepEqual(t.rows, [
      [5, 'five', null],
      [6, 'six', 'more'],
    ]);
  });

  test('refuses what it cannot read whole: not SQLite, damaged, a missing table, a WITHOUT ROWID table', () => {
    assert.equal(sqliteEntries(new TextEncoder().encode('id,name\n1,a\n')).why, 'not-sqlite');
    const bytes = made(
      'CREATE TABLE t (a TEXT); INSERT INTO t VALUES (1); CREATE TABLE w (k TEXT PRIMARY KEY) WITHOUT ROWID;',
    );
    assert.equal(sqliteTable(bytes, 'nope').why, 'no-table');
    assert.match(sqliteTable(bytes, 'w').refused, /WITHOUT ROWID/);
    const cut = bytes.slice(0, 4096 + 100);
    assert.ok(['damaged', 'no-table'].includes(sqliteTable(cut, 't').why));
    // a page that points at itself is refused, never walked for ever
    const looped = bytes.slice();
    const view = new DataView(looped.buffer);
    looped[100] = 0x05;
    view.setUint16(103, 0);
    view.setUint32(108, 1);
    assert.equal(sqliteEntries(looped).why, 'damaged');
  });

  test('refuses a table over the row limit, never reads it in part', () => {
    const bytes = made(
      `CREATE TABLE big (a INT); WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${SQLITE_LIMITS.rows + 1}) INSERT INTO big SELECT i FROM n;`,
    );
    assert.equal(sqliteTable(bytes, 'big').why, 'too-many-rows');
  });

  test('reads column names written in each way SQL allows', () => {
    assert.deepEqual(columnsOf('CREATE TABLE t ("a b" TEXT, `c` INT, [d] REAL, e, CONSTRAINT k UNIQUE (e))').columns, [
      'a b',
      'c',
      'd',
      'e',
    ]);
    assert.equal(columnsOf('CREATE TABLE t (x TEXT, id INTEGER PRIMARY KEY)').rowid, 1);
    assert.equal(columnsOf('CREATE TABLE t (id INT PRIMARY KEY)').rowid, -1, 'only INTEGER is the rowid');
    assert.equal(columnsOf('CREATE TABLE t (k TEXT PRIMARY KEY) WITHOUT  ROWID;').withoutRowid, true);
    // a long run of spaces after WITHOUT is read at once, never slowly (CodeQL, polynomial regular expression)
    const started = Date.now();
    assert.equal(columnsOf(`CREATE TABLE t (a)without${'\t'.repeat(100_000)}x`).withoutRowid, false);
    assert.ok(Date.now() - started < 1000);
  });
});
