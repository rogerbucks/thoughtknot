// OPS-10: the spread between runs is put into the metrics, and so into the baseline committed from them.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withSpread } from '../scripts/record-spread.mjs';
import { read, ROOT } from './repository/repo.js';

const made = [];
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));
const metrics = { about: 'a', machine: { os: 'linux' }, metrics: { max_source_lines: 1 } };
const spread = (largest) => ({ details: { instructions: { largest_spread: largest } } });

describe('recording the spread', () => {
  test('puts largest_spread after the machine, keeping the rest', () => {
    const made = withSpread(metrics, spread(0.012));
    assert.deepEqual(Object.keys(made), ['machine', 'largest_spread', 'about', 'metrics']);
    assert.equal(made.largest_spread, 0.012);
  });

  test('leaves the metrics as they were when the spread file holds no figure', () => {
    assert.equal(withSpread(metrics, spread(undefined)), metrics);
    assert.equal(withSpread(metrics, {}), metrics);
  });

  test('the command writes it to the metrics file, and fails when there is none to write', () => {
    const dir = mkdtempSync(join(tmpdir(), 'record-spread-'));
    made.push(dir);
    const [m, s] = [join(dir, 'metrics.json'), join(dir, 'spread.json')];
    writeFileSync(m, JSON.stringify(metrics));
    writeFileSync(s, JSON.stringify(spread(0.01)));
    const run = () =>
      spawnSync(process.execPath, [join(ROOT, 'scripts/record-spread.mjs'), m, s], { encoding: 'utf8' });
    assert.equal(run().status, 0);
    assert.equal(JSON.parse(readFileSync(m, 'utf8')).largest_spread, 0.01);
    writeFileSync(s, '{}');
    assert.equal(run().status, 1);
  });

  test('the quality baseline workflow runs it after the spread is counted, only when the spread was asked for', () => {
    assert.match(
      read('.github/workflows/quality-baseline.yml'),
      /--out quality\/instruction-spread\.json\n(?:.*\n)*? +if: \$\{\{ inputs\.spread \}\}\n +run: node scripts\/record-spread\.mjs quality\/metrics\.json quality\/instruction-spread\.json/,
    );
  });
});
