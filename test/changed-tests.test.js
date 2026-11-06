// Requirement: touched_tests_only (editor spec ES§13).
// Likely-to-fail-first order of the tests a change chooses (editor spec ES§13, touched_tests_only).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { likelyFirst } from '../scripts/changed-tests.mjs';

describe('the order the chosen tests run in', () => {
  test('the test files the change edits run first and the rest keep their order', () => {
    const files = ['test/a.test.js', 'test/b.test.js', 'test/c.test.js'];
    assert.deepEqual(likelyFirst(files, ['src/x.ts', 'test/c.test.js']), [
      'test/c.test.js',
      'test/a.test.js',
      'test/b.test.js',
    ]);
  });
  test('the same tests run, whatever the order', () => {
    const files = ['test/a.test.js', 'test/b.test.js'];
    assert.deepEqual([...likelyFirst(files, ['test/b.test.js'])].sort(), files);
    assert.deepEqual(likelyFirst(files, []), files);
  });
});
