// The requirements and the tests are held together in CI (spec §12, requirements_drift_ratcheted):
// - these are listed as drift:
//   - a requirement with no test;
//   - one whose tests are not all written;
//   - a written test that never names a requirement it claims;
//   - a test file that checks no requirement.
// - quality/requirements-drift.json lists the drift there is now. A new entry fails. So does a fixed one, until it comes
//   off the list, so each list only shrinks.
// Pure: the real files are read, nothing is fetched.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, LIST, compareToList, drift } from '../scripts/requirements-drift.mjs';
import { read, readJSON } from './repository/repo.js';

const COPY = `// graph: editor_requirements · SOURCE
// The editor's requirements graph, the one source: edit it here, in a pull request. A test only moves forward.
INSERT
(a:Requirement {section: '1', slice: 1, level: 'must', rule: 'A'}),
(b:Requirement {section: '1', slice: 1, level: 'must', rule: 'B'}),
(c:Requirement {section: '1', slice: 1, level: 'must', rule: 'C'}),
(d:Requirement {section: '1', slice: 2, level: 'must', rule: 'D'}),
(t_a:Test {proves: 'a', file: 'test/a.test.js', where: 'repo', status: 'written'}),
(t_b:Test {proves: 'b', file: 'test/b.test.js', where: 'repo', status: 'planned'}),
(a)-[:PROVED_BY]->(t_a),
(b)-[:PROVED_BY]->(t_b),
(d)-[:PROVED_BY]->(t_a)`;

const run = (files, texts = {}) => drift(COPY, { files, text: (f) => texts[f] ?? '' });

describe('where the requirements and the tests part', () => {
  test('a requirement with no test is listed', () => {
    assert.deepEqual(run([], { 'test/a.test.js': 'a' })['no-test'], ['c']);
  });

  test('a requirement in an earlier slice whose test is not written is listed, the slice being built is not', () => {
    assert.deepEqual(run([], { 'test/a.test.js': 'a' })['not-written'], ['b']);
  });

  test('a written test whose file names none of its requirements is listed', () => {
    assert.deepEqual(run([], { 'test/a.test.js': 'nothing here' }).uncited, ['t_a']);
    assert.deepEqual(run([], { 'test/a.test.js': 'it checks d' }).uncited, []);
  });

  test('a requirement id counts only as a whole word', () => {
    assert.deepEqual(run([], { 'test/a.test.js': 'ad, bad' }).uncited, ['t_a']);
  });

  test('a test file no record names and that names no requirement is listed', () => {
    const found = run(
      [
        ['test/a.test.js', 'a'],
        ['test/stray.test.js', 'nothing'],
        ['test/cites.test.js', 'proves c'],
        ['test/spec.test.js', 'req:3.first-line'],
      ],
      { 'test/a.test.js': 'a' },
    );
    assert.deepEqual(found.orphan, ['test/stray.test.js']);
  });
});

describe('the list may only shrink', () => {
  const now = { 'no-test': ['x'], 'not-written': [], uncited: [], orphan: [] };

  test('a new entry fails, naming the kind and how to fix it', () => {
    const problems = compareToList(now, { 'no-test': [] });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^no-test: x is new drift/);
  });

  test('a fixed entry fails until it comes off the list', () => {
    const problems = compareToList(now, { 'no-test': ['x', 'y'] });
    assert.deepEqual(problems, ['no-test: y is fixed now: run node scripts/requirements-drift.mjs --update']);
  });

  test('the repository holds exactly the drift it lists', () => {
    const listed = readJSON(LIST);
    for (const k of KINDS) assert.ok(Array.isArray(listed[k]), `${LIST} has no ${k} list`);
    const copy = read('requirements/editor-requirements.md');
    assert.deepEqual(compareToList(drift(copy), listed), []);
  });
});
