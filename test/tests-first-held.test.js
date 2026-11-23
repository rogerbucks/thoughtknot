// The tests a reason may name beside those that passed first (ES§12, tests_first): scripts/tests-first-held.mjs. The
// records are made on a Mac and CI replays on Ubuntu. A test held before on one may be new on the other (PR 2427).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { excuse, writeRecord } from '../scripts/tests-first-records.mjs';
import { heldTests, reasonsForNoTest } from '../scripts/tests-first-held.mjs';
import { replay } from '../scripts/tests-first.mjs';
import { repository } from './repository/scratch-repository.js';

const TWICE = (body) =>
  `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { twice } from '../src/twice.js';\n${body}\n`;

describe('the tests a file held before its commit', () => {
  // PR 2427: a test's old version failed at the parent on CI's Ubuntu, but passed on the Mac. So CI found it new and
  // passing first, and asked for a reason. The Mac's record must name the test, so the reason has one
  test('a test the commit changed that its file held before is named in the record, so a reason asked for elsewhere names a real test', () => {
    const r = repository([
      { 'src/twice.js': 'export const twice = (x) => x * 2;\n', 'test/twice.test.js': TWICE("test('one', () => {});") },
      { 'test/twice.test.js': TWICE("test('one', () => assert.equal(twice(1), 2));") },
    ]);
    try {
      const replayed = replay(r.dir, r.ids[1]);
      const [file] = replayed.files;
      assert.deepEqual([file.failedFirst, file.passedFirst, file.held], [[], [], ['one']]);
      writeRecord(r.dir, { commit: replayed.commit, files: replayed.files });
      assert.deepEqual(heldTests(r.dir), ['test/twice.test.js :: one']);
    } finally {
      r.done();
    }
  });

  test('a reason for a test held in a file a recorded commit changed is kept; one for a file it left alone, or no test, is not', () => {
    const r = repository([
      {
        'src/twice.js': 'export const twice = (x) => x * 2;\n',
        'test/twice.test.js': TWICE("test('one', () => {});"),
        'test/still.test.js': TWICE("test('kept', () => {});"),
      },
      { 'test/twice.test.js': TWICE("test('one', () => assert.equal(twice(1), 2));") },
    ]);
    try {
      const replayed = replay(r.dir, r.ids[1]);
      writeRecord(r.dir, { commit: replayed.commit, files: replayed.files });
      excuse(r.dir, 'test/twice.test.js', 'one', 'its old version failed at the parent on Ubuntu');
      assert.deepEqual(reasonsForNoTest(r.dir), []);
      excuse(r.dir, 'test/still.test.js', 'kept', 'a file no recorded commit changed');
      excuse(r.dir, 'test/twice.test.js', 'missing', 'a test the file never held');
      assert.deepEqual(reasonsForNoTest(r.dir), ['test/still.test.js :: kept', 'test/twice.test.js :: missing']);
    } finally {
      r.done();
    }
  });
});
