// A release says which Graph Spec version it implements. It also says how many conformance cases pass.
// Its library archive holds the spec and its cases (editor spec §51, spec_version_released).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changelogText, graphSpecFacts, hasGraphSpec } from '../scripts/changelog.mjs';

describe('spec_version_released', () => {
  test('the notes name the spec version and the conformance count', () => {
    const spec = graphSpecFacts();
    assert.equal(spec.version, '1.0');
    assert.ok(spec.cases >= 20, `${spec.cases} cases`);
    const text = changelogText({
      version: '0.9.0',
      from: '0.8.0',
      pulls: [],
      repo: 'o/r',
      before: null,
      after: {},
      spec,
    });
    assert.match(text, /^### Graph Spec$/m);
    assert.match(text, new RegExp(`implements Graph Spec 1\\.0\\. ${spec.cases} conformance cases pass`));
    assert.ok(hasGraphSpec(text));
  });

  test('notes without the section or without the count are refused', () => {
    assert.equal(hasGraphSpec('## 0.9.0\n\n### Library changes\n'), false);
    assert.equal(hasGraphSpec('### Graph Spec\n\nThis release implements Graph Spec 1.0.\n'), false);
  });

  test('--check refuses notes that leave the spec out', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spec-notes-'));
    try {
      writeFileSync(join(dir, 'notes.md'), '## 0.9.0\n\n### Library changes\n\nNothing.\n');
      assert.throws(() =>
        execFileSync(process.execPath, ['scripts/changelog.mjs', '--check', join(dir, 'notes.md')], { stdio: 'pipe' }),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the library archive holds the spec, its version and its cases', async () => {
    const out = mkdtempSync(join(tmpdir(), 'spec-archive-'));
    try {
      execFileSync(process.execPath, ['scripts/library-release.mjs', '--out', out], { stdio: 'pipe' });
      const tgz = readdirSync(out).find((f) => f.startsWith('thoughtknot-graph-spec-'));
      const list = execFileSync('tar', ['-tzf', join(out, tgz)], { encoding: 'utf8' }).split('\n');
      for (const file of [
        'graph-spec.gql',
        'graph-spec-version.json',
        'graph-spec-grammar.json',
        'graph-spec-canonical.md',
        'graph-spec-library-api.json',
        'graph-spec-problem-codes.json',
        'graph-spec-formats.json',
        'graph-spec-ai-wire.json',
        'LICENSE-SPEC.md',
      ])
        assert.ok(
          list.some((l) => l.endsWith(`spec/${file}`)),
          `${file} is in the archive`,
        );
      assert.ok(
        list.some((l) => /spec\/conformance\/.+\.md$/.test(l)),
        'the conformance cases are in the archive',
      );
      assert.ok(existsSync(join(out, tgz)) && readFileSync(join(out, tgz)).length > 0);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
