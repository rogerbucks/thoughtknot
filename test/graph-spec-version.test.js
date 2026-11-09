// The Graph Spec carries a version (editor spec §51, spec_versioned). Its rules are requirements/graph-spec.gql; its
// version and changelog are requirements/graph-spec-version.json. A change to the rules fails here without a new
// version and a changelog line. So does a changelog line that lacks its decision or the owner's approval.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const load = () => import('../scripts/graph-spec-version.mjs');

describe('spec_versioned', () => {
  test('the spec names its version, and the rules match its last changelog line', async () => {
    const m = await load();
    assert.equal(m.readVersion().version, '1.2');
    assert.deepEqual(m.problems(), []);
  });

  test('a change to the rules without a new version and changelog line fails', async () => {
    const m = await load();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-version-'));
    fs.mkdirSync(path.join(root, 'requirements'));
    for (const f of [m.SPEC_FILE, m.VERSION_FILE]) fs.copyFileSync(path.join(HERE, '..', f), path.join(root, f));
    assert.deepEqual(m.problems(root), []);
    fs.appendFileSync(path.join(root, m.SPEC_FILE), "\n(a_new_rule:Requirement {rule: 'x'})");
    const found = m.problems(root);
    assert.equal(found.length, 1);
    assert.match(found[0], /rules changed since Graph Spec 1\.2.*new version.*decision.*approval/);
  });

  test('a comment line in the header is not a rule', async () => {
    const m = await load();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-version-'));
    fs.mkdirSync(path.join(root, 'requirements'));
    for (const f of [m.SPEC_FILE, m.VERSION_FILE]) fs.copyFileSync(path.join(HERE, '..', f), path.join(root, f));
    fs.appendFileSync(path.join(root, m.SPEC_FILE), '\n// a note for readers');
    assert.deepEqual(m.problems(root), []);
  });

  test('a changelog line without its decision or approval fails', async () => {
    const m = await load();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-version-'));
    fs.mkdirSync(path.join(root, 'requirements'));
    fs.copyFileSync(path.join(HERE, '..', m.SPEC_FILE), path.join(root, m.SPEC_FILE));
    const v = m.readVersion();
    delete v.changelog[0].approved_by;
    delete v.changelog[0].decision;
    fs.writeFileSync(path.join(root, m.VERSION_FILE), JSON.stringify(v));
    assert.deepEqual(m.problems(root), ['changelog line 1 has no decision', 'changelog line 1 has no approved_by']);
  });
});
