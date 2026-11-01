// Every refusal of the graph-spec library carries a stable code (spec_library_api: API-8), as the reader's problems do.
// A caller tells one refusal from another by its code, never by its words. The reader's codes are in
// src/reader/problem-codes.json; every other refusal's is in src/values/refusal-codes.json. The sources are scanned, so
// a new throw without a code fails.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const { codes: CODES } = require('../src/values/refusal-codes.json');
const { Refusal, refused } = require('../src/values/refusal.js');
const gs = require('../src/graph-spec-check.js');
const layout = require('../src/graph-layout.js');

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : [],
  );
const SOURCES = walk(SRC).map((f) => ({ file: relative(SRC, f), text: readFileSync(f, 'utf8') }));

/** Every `throw` of the library, each with what it throws as written, leaving out a caught error thrown on. */
const throws = () =>
  SOURCES.flatMap(({ file, text }) =>
    [...text.matchAll(/\bthrow\s+([^;]{0,80})/g)]
      .map((m) => ({ file, thrown: m[1] }))
      .filter(({ thrown }) => !/^(e|err|error)\b\s*$/.test(thrown.trim())),
  );

/** The code each `refused(…)` and `new LayoutError(…)` passes, each a literal. */
const codesUsed = () =>
  SOURCES.flatMap(({ text }) =>
    [...text.matchAll(/\b(?:refused|new LayoutError)\(\s*'([A-Z]{2}\d{2})'/g)].map((m) => m[1]),
  );

describe('every refusal has its code', () => {
  test('every throw is a reader problem, a Refusal by its code, or a LayoutError by its code', () => {
    const bare = throws().filter(
      ({ thrown }) =>
        !/^(new (ProfileError|IdNotTextError)\(|refused\(\s*'|refusal\(|new LayoutError\(\s*')/.test(thrown),
    );
    assert.deepEqual(
      bare.map(({ file, thrown }) => `${file}: ${thrown}`),
      [],
    );
  });

  test('every code used is in the table, and every code in the table is used', () => {
    const used = new Set(codesUsed());
    assert.deepEqual(
      [...used].filter((c) => !(c in CODES)),
      [],
    );
    assert.deepEqual(
      Object.keys(CODES).filter((c) => !used.has(c)),
      [],
    );
  });

  test('a code is GR or GL and two digits, and says what it refuses', () => {
    for (const [code, about] of Object.entries(CODES)) {
      assert.match(code, /^G[RL]\d{2}$/);
      assert.ok(about.length > 20, code);
    }
  });
});

describe('a refusal, as a caller meets it', () => {
  test('is an Error named for what it is, with its code and its words unchanged', () => {
    const e = refused('GR01', 'The axis of time must be recorded or real, not soon');
    assert.ok(e instanceof Error && e instanceof Refusal);
    assert.equal(e.name, 'Refusal');
    assert.equal(e.code, 'GR01');
    assert.equal(e.message, 'The axis of time must be recorded or real, not soon');
  });

  test('a call the library refuses gives its code: the time axis, and the layout with no direction', () => {
    const g = gs.worldFromStore(gs.read(["// graph: g\n(a:T {name: 'A'})"])).g;
    assert.throws(() => gs.asAt(g, 'soon', '2026-10-01'), { name: 'Refusal', code: 'GR01' });
    assert.throws(() => gs.jcs(Number.NaN), { code: 'GR02' });
    assert.throws(() => layout.dotSource([['a', 'A', 'a']], [], null, {}), { name: 'LayoutError', code: 'GL02' });
  });
});
