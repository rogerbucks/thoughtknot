// OPS-9, OPS-11 and OPS-12: what Dependabot watches and the release's SBOM, the wiki that survives a missing Chrome, and
// the docs that tell the truth about schedules and write access. Read as text, by indentation, as policy.test.js does.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { block, jobs, permissionValues, read, runCommands, stripComment, workflowFiles } from './repository/repo.js';

describe('dependencies nobody bumped (OPS-9)', () => {
  test('Dependabot watches the Docker base image as well as npm, uv and the actions', () => {
    const text = read('.github/dependabot.yml');
    for (const ecosystem of ['npm', 'uv', 'github-actions', 'docker'])
      assert.match(text, new RegExp(`package-ecosystem: ${ecosystem}\\n +directory: `), ecosystem);
    assert.match(text, /package-ecosystem: docker\n +directory: \/docker\n/);
  });

  test('the release writes a CycloneDX bill of materials, checksums it, attests it and attaches it', () => {
    const text = read('.github/workflows/release.yml');
    const runs = runCommands(text);
    assert.ok(runs.includes('npm sbom --sbom-format cyclonedx > "thoughtknot-sbom-$GITHUB_REF_NAME.cdx.json"'));
    assert.match(
      runs.find((r) => r.startsWith('sha256sum')),
      /thoughtknot-sbom-\$GITHUB_REF_NAME\.cdx\.json/,
    );
    assert.match(
      runs.find((r) => r.startsWith('gh release create')),
      /thoughtknot-sbom-\$GITHUB_REF_NAME\.cdx\.json/,
    );
    assert.match(text, /subject-path: \|(?:\n +\S+)*\n +thoughtknot-sbom-\*\.cdx\.json/);
  });

  test('CONTRIBUTING.md says which pins are bumped by hand, with a new baseline', () => {
    const text = read('CONTRIBUTING.md');
    assert.match(text, /### Pins that are bumped by hand[\s\S]*Node patch[\s\S]*setup-uv[\s\S]*new quality baseline/);
  });
});

describe('the wiki without Chrome (OPS-11)', () => {
  test('a screenshot that cannot be taken is a warning, as it is for Pages, and never fails the job', () => {
    for (const file of ['wiki', 'pages']) {
      const text = read(`.github/workflows/${file}.yml`);
      const step = /node scripts\/wiki-screens\.mjs[^\n]*\n[^\n]*\|\| echo "::warning::[^\n]*"/.exec(text);
      assert.ok(step, `${file} warns when the screenshots fail`);
    }
  });

  test('the wiki is pushed without deleting the pictures it already has', () => {
    const publish = (jobs(read('.github/workflows/wiki.yml')).publish ?? []).join('\n');
    assert.match(publish, /rsync -a --exclude/);
    assert.doesNotMatch(publish, /--delete/);
  });
});

describe('the docs on schedules and write access (OPS-12)', () => {
  const contributing = read('CONTRIBUTING.md');

  test('the advisory watch is said to run weekly, as its cron does', () => {
    assert.match(read('.github/workflows/engine-advisories.yml'), /cron: '17 6 \* \* 1'/);
    assert.doesNotMatch(contributing, /weekly schedule is off/);
    assert.match(contributing, /Engine advisories" workflow\*\* runs every Monday at 06:17 UTC/);
  });

  test('the README no longer says only the release job may write', () => {
    assert.doesNotMatch(read('README.md'), /only\s+the release job may write/);
    assert.match(read('README.md'), /Who may write what/);
  });

  test('every job with a write permission is named in the table, with its workflow', () => {
    const table = contributing.split('### Who may write what')[1]?.split('\n### ')[0] ?? '';
    assert.ok(table.includes('| Workflow | Job | Writes | Why |'));
    for (const file of workflowFiles()) {
      const workflow = file
        .split('/')
        .pop()
        .replace(/\.ya?ml$/, '');
      const text = read(file);
      for (const [name, body] of Object.entries(jobs(text))) {
        const permissions = block(body, 'permissions', 4);
        if (!permissions) continue;
        const keys = permissions
          .slice(1)
          .map(stripComment)
          .filter((l) => /: write$/.test(l.trim()));
        if (!keys.length && !permissionValues(permissions).includes('write')) continue;
        assert.match(table, new RegExp(`\\| ${workflow} \\| \`${name}\` \\|`), `${workflow} ${name} writes`);
      }
    }
  });
});
