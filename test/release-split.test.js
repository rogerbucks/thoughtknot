// TRUST-3: the stable release is built apart from where it is published. No job that installs or tests may write or
// sign. The job that publishes and attests runs no code of the repository.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { block, jobs, permissionValues, read, stripComment, usesRefs, workflowFiles } from './repository/repo.js';

const WRITES = /\b(contents|id-token|attestations|packages|actions|pull-requests|issues):\s*write\b|write-all/;
const RUNS_CODE = /\bnpm (ci|test|install|i|run)\b|\bnpx\b|\bnode\b|actions\/checkout/;

describe('the release', () => {
  const all = jobs(read('.github/workflows/release.yml'));

  test('builds with read access only, and hands the files to the publish job', () => {
    const build = all.release;
    assert.equal(block(build, 'permissions', 4), null, 'the build job keeps the workflow’s read-only token');
    assert.match(build.join('\n'), /run: npm ci/);
    assert.match(build.join('\n'), /uses: actions\/upload-artifact@[0-9a-f]{40}/);
    assert.match(block(all.publish, 'needs', 4).join('\n'), /\brelease\b/);
  });

  test('publishes and attests in a job that runs no code of the repository', () => {
    const publish = all.publish;
    const perms = permissionValues(block(publish, 'permissions', 4));
    assert.deepEqual(perms.sort(), ['write', 'write', 'write']);
    assert.deepEqual(
      [...new Set(usesRefs(publish.join('\n')).map((r) => r.split('@')[0]))],
      ['actions/download-artifact', 'actions/attest-build-provenance'],
    );
    assert.doesNotMatch(publish.map(stripComment).join('\n'), RUNS_CODE);
    const at = (re) => publish.findIndex((l) => re.test(l));
    assert.ok(at(/sha256sum --check --strict SHA256SUMS/) > 0, 'the files are checked against the build’s sums');
    assert.ok(at(/sha256sum --check/) < at(/attest-build-provenance/));
    assert.ok(at(/attest-build-provenance/) < at(/gh release create/));
  });
});

test('no job in any workflow that runs npm ci or npm test holds a write permission, a signing token or attestations', () => {
  for (const f of workflowFiles()) {
    for (const [name, lines] of Object.entries(jobs(read(f)))) {
      const body = lines.map(stripComment).join('\n');
      if (!/\bnpm (ci|test)\b/.test(body)) continue;
      const perms = block(lines, 'permissions', 4);
      const given = (perms ?? []).map(stripComment).join('\n');
      assert.doesNotMatch(given, /\b(id-token|attestations):\s*write\b/, `${f} ${name}`);
      if (f.endsWith('/release.yml') || f.endsWith('/nightly.yml')) assert.doesNotMatch(given, WRITES, `${f} ${name}`);
    }
  }
});
