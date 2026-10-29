// OPS-6 and OPS-7: a scheduled or background workflow that fails must tell somebody. The nightly, the wiki, Pages and the
// engine advisories each call one reusable workflow. It keeps an issue labelled workflow-failure. A daily token
// probe opens one on the third refusal in a row. Read as text, by indentation, as the other workflow tests do.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { exists, jobs, read, stripComment } from './repository/repo.js';

const REPORT = '.github/workflows/report-failure.yml';
const WATCH = '.github/workflows/token-watch.yml';
const CALLERS = ['nightly', 'wiki', 'pages', 'engine-advisories'];

describe('the failure report', () => {
  test('is a reusable workflow that writes issues and nothing else, and runs no code of the repository', () => {
    assert.ok(exists(REPORT));
    const text = read(REPORT);
    assert.match(text, /workflow_call:/);
    const report = jobs(text).report.map(stripComment).join('\n');
    assert.match(report, /issues: write/);
    assert.doesNotMatch(report, /contents: write|actions\/checkout|npm |setup-node/);
    assert.match(report, /timeout-minutes: \d+/);
    assert.match(report, /workflow-failure/);
    assert.match(report, /gh issue create/);
    assert.match(report, /gh issue comment/);
  });

  for (const name of CALLERS) {
    test(`${name} calls it when any of its jobs fails, and so names every other job`, () => {
      const text = read(`.github/workflows/${name}.yml`);
      const all = jobs(text);
      const call = (all['report-failure'] ?? []).map(stripComment).join('\n');
      assert.match(call, /if: failure\(\)/);
      assert.match(call, /uses: \.\/\.github\/workflows\/report-failure\.yml/);
      assert.match(call, /issues: write/);
      const needs = /needs: \[(.*)\]/.exec(call)?.[1].split(/,\s*/) ?? [];
      const others = Object.keys(all).filter((j) => j !== 'report-failure');
      assert.deepEqual([...needs].sort(), others.sort());
    });
  }

  test('the wave nightly passes the nightly the right to write issues', () => {
    assert.match(read('.github/workflows/wave-nightly.yml'), /permissions:\n +contents: write\n +issues: write/);
  });
});

describe('the token watch', () => {
  const text = exists(WATCH) ? read(WATCH) : '';
  const probe = (jobs(text).probe ?? []).map(stripComment).join('\n');

  test('asks GitHub daily whether PROJECT_TOKEN works, and prints nothing of it', () => {
    assert.match(text, /cron: '\d+ \d+ \* \* \*'/);
    assert.match(probe, /secrets\.PROJECT_TOKEN/);
    assert.match(probe, /gh api graphql/);
    assert.doesNotMatch(probe, /echo "?\$GH_TOKEN|set -x/);
    assert.match(probe, /timeout-minutes: \d+/);
  });

  test('opens an issue only when this refusal and the two runs before it all failed, and only one', () => {
    assert.match(probe, /--limit 2/);
    assert.match(probe, /\[ "\$earlier" = 2 \] && \[ -z "\$open" \]/);
    assert.match(probe, /gh issue create/);
    assert.match(probe, /actions: read/);
  });

  test('fails the run on a refusal, so the run list shows it', () => {
    assert.match(probe, /continue-on-error: true/);
    assert.match(probe, /^ +exit 1$/m);
  });

  test('RELEASING.md gives when each token must be renewed by', () => {
    const releasing = read('RELEASING.md');
    assert.match(releasing, /Renew by 1 Oct 2027/);
    assert.match(releasing, /Renew by 10 Oct 2027/);
  });
});
