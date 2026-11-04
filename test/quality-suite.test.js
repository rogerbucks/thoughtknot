// The coverage of a suite split over machines (quality_ratchet, CODE-3): the reports of the shares merge into one the ratchet reads.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLcov, mergeSuiteShards, parseLcov } from '../scripts/quality-suite.mjs';

const part = (file, ...lines) =>
  `SF:${file}\n${lines.map(([n, h]) => `DA:${n},${h}`).join('\n')}\nLF:${lines.length}\nLH:${lines.filter(([, h]) => h).length}\nend_of_record\n`;

describe('the coverage of a suite split over machines (CODE-3)', () => {
  test('a line is hit when any share hit it, and a file in one share only is kept', () => {
    const one = part('packages/core/src/a.ts', [1, 3], [2, 0], [3, 0]) + part('packages/core/src/b.ts', [1, 0]);
    const two = part('packages/core/src/a.ts', [1, 0], [2, 4], [3, 0]);
    const merged = mergeLcov([one, two]);
    assert.deepEqual(parseLcov(merged, 'packages/core/src/'), { files: 2, lines: 4, hit: 2, percent: 50 });
    assert.match(merged, /DA:1,3\nDA:2,4\nDA:3,0\nLF:3\nLH:2/);
  });

  test('merging one report changes none of its figures', () => {
    const one = part('packages/core/src/a.ts', [1, 1], [2, 0]);
    assert.deepEqual(parseLcov(mergeLcov([one]), 'packages/core/src/'), parseLcov(one, 'packages/core/src/'));
    assert.equal(mergeLcov([]).trim(), '');
  });
});

describe('the suite measured in shares on machines of their own (quality_ratchet)', () => {
  const share = (over = {}) => ({
    seconds: 100,
    firstPassed: true,
    firstStderr: '',
    secondPassed: true,
    secondStderr: '',
    quietBytes: 10,
    first: [['a.js > one', 'pass']],
    second: [['a.js > one', 'pass']],
    lcov: part('packages/core/src/a.ts', [1, 1]),
    ...over,
  });

  test('the shares add up to one suite: its slowest time, all its tests, its bytes, and the coverage of every share', () => {
    const { metrics, details } = mergeSuiteShards([
      share(),
      share({
        seconds: 250,
        quietBytes: 5,
        first: [['b.js > two', 'pass']],
        second: [['b.js > two', 'pass']],
        lcov: part('packages/core/src/b.ts', [1, 0]),
      }),
    ]);
    assert.equal(metrics.suite_seconds, 250);
    assert.equal(metrics.quiet_run_bytes, 15);
    assert.equal(metrics.flaky_tests, 0);
    assert.equal(details.tests, 2);
    assert.equal(details.coverage_files, 2);
  });

  test('a test whose result differs between the two runs is flaky, and a failed share is named', () => {
    const flaky = mergeSuiteShards([share({ second: [['a.js > one', 'fail']] })]);
    assert.deepEqual(flaky.details.flaky, ['a.js > one']);
    const failed = mergeSuiteShards([share(), share({ firstPassed: false, quietBytes: null, first: [] })]);
    assert.equal(failed.metrics.quiet_run_bytes, null);
    assert.equal(failed.details.failing.length, 1);
  });
});
