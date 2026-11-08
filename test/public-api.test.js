// The graph spec lists the library's operations and the shape of its problems (editor spec §51, spec_library_api).
// requirements/graph-spec-library-api.json lists them. This holds the JavaScript library to it: each operation is
// exported with enough parameters, and a problem has the listed fields. The problem codes are held to a record that only
// grows: a code is never reused or changed. python/graph_spec/tests/test_library_api.py holds the Python library to the
// same file and the same record.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../packages/graph-spec/src/graph-spec-check.js');
const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const API = json('../requirements/graph-spec-library-api.json');
const TABLE = json('../packages/graph-spec/src/reader/problem-codes.json');
const RECORD = json('../requirements/graph-spec-problem-codes.json');
const parts = (c) => [...new Set([...(c.message + ' ' + c.fix).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

describe('spec_library_api', () => {
  test('each listed operation is exported by the JavaScript library with enough parameters', () => {
    assert.ok(API.operations.length >= 20, `${API.operations.length} operations`);
    for (const op of API.operations) {
      assert.equal(typeof C[op.js], 'function', `${op.operation}: ${op.js}`);
      assert.ok(C[op.js].length >= op.required, `${op.operation} takes at least ${op.required}`);
      assert.ok(op.takes.length >= op.required && op.gives, `${op.operation} says what it takes and gives`);
      assert.ok(/^[\w.]+\.\w+$/.test(op.py), `${op.operation}: ${op.py} names its Python module`);
    }
  });

  test('a problem has the listed fields', () => {
    let problem;
    try {
      C.read(['(a:T)']);
    } catch (e) {
      problem = e;
    }
    assert.ok(problem instanceof C.ProfileError);
    assert.equal(problem.constructor.name, API.problem.raised_as);
    assert.equal(typeof problem.line, 'number');
    assert.equal(typeof problem.msg, 'string');
    assert.equal(typeof problem.fix, 'string');
    assert.match(problem.code, /^GN\d{3}$/);
    assert.deepEqual(Object.keys(API.problem.fields), ['line', 'message', 'fix', 'at', 'code']);
  });

  test('a problem code is never reused: every code in the record is still here, the same, or retired', () => {
    const now = new Map(TABLE.codes.map((c) => [c.code, c]));
    const retired = new Set(RECORD.retired);
    for (const [code, was] of Object.entries(RECORD.codes)) {
      if (retired.has(code)) {
        assert.ok(!now.has(code), `${code} is retired and must not come back`);
        continue;
      }
      const c = now.get(code);
      assert.ok(c, `${code} is gone: list it under retired in the record`);
      assert.equal(c.section, was.section, `${code} moved to another section`);
      assert.deepEqual(parts(c), was.parts, `${code} fills in other parts`);
      assert.deepEqual(c.libraries, was.libraries, `${code} is raised by other libraries`);
    }
  });

  test('a code added to the table is added to the record', () => {
    for (const c of TABLE.codes)
      assert.ok(RECORD.codes[c.code], `${c.code} is not in requirements/graph-spec-problem-codes.json`);
  });
});
