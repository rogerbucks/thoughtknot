// No new core module of more than 100 lines goes without a test named after it (spec §13, test_conventions: CODE-7).
// Those that have none are held by test/unnamed-modules.json, a list that only shrinks. Proved on the repository's own
// core and on modules and tests planted for the purpose.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWANCE,
  compareAllowance,
  repositoryModules,
  tightened,
  unnamedModules,
} from '../scripts/unnamed-modules.mjs';
import { readJSON } from './repository/repo.js';

const lines = (n) => 'export const x = 1;\n'.repeat(n);

describe('the repository', () => {
  test('has no long core module without its test beyond the list, and the list is as short as the core now needs', () => {
    const found = repositoryModules();
    assert.ok(
      !found.some((f) => f.file === 'packages/core/src/zoom.ts'),
      'the control: zoom.ts has zoom.test.js, so it is not on it',
    );
    assert.deepEqual(compareAllowance(found, readJSON(ALLOWANCE)), []);
  });

  test('the four modules the panel named have tests of their own now', () => {
    const files = repositoryModules().map((f) => f.file);
    for (const m of ['proposals-review', 'style-graph', 'link-scan', 'style-checks'])
      assert.ok(!files.includes(`packages/core/src/${m}.ts`), `${m}.ts has its test`);
  });
});

describe('a module’s own test', () => {
  const modules = {
    'packages/core/src/zoom.ts': lines(3),
    'packages/core/src/zoomed.ts': lines(3),
    'packages/core/src/display/menu.ts': lines(3),
    'packages/core/src/plain.ts': lines(3),
    'packages/core/src/types.d.ts': lines(3),
  };

  test('is a test of the same name, or that name and a dash; a display module’s may be the plugin’s', () => {
    const found = unnamedModules(modules, {
      core: ['packages/core/test/zoom-limits.test.js'],
      plugin: ['packages/obsidian/test/menu.test.js', 'packages/obsidian/test/plain.test.js'],
    });
    assert.deepEqual(
      found.map((f) => f.file),
      ['packages/core/src/plain.ts', 'packages/core/src/zoomed.ts'],
    );
  });
});

describe('the list, a ratchet', () => {
  const found = [
    { file: 'a.ts', lines: 150 },
    { file: 'short.ts', lines: 100 },
    { file: 'new.ts', lines: 101 },
  ];

  test('a long module off the list fails; a short one does not; one listed that gained its test is to be taken off', () => {
    const differ = compareAllowance(found, ['a.ts', 'tested.ts']);
    assert.deepEqual(
      differ.map((d) => `${d.file} ${d.over ? 'over' : 'under'}`),
      ['new.ts over', 'tested.ts under'],
    );
  });

  test('tightening takes off the modules with their tests now, and never adds one', () => {
    assert.deepEqual(tightened(found, ['a.ts', 'tested.ts']), ['a.ts']);
  });
});
