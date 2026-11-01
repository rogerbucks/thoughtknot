// The coverage of a suite split over machines (quality_ratchet, CODE-3): the reports of the shares merge into one the ratchet reads.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLcov, parseLcov } from '../scripts/quality-suite.mjs';

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
