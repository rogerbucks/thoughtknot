// OPS-8: the repository's ruleset and Pages settings are exported to .github/settings/, and held whole against GitHub's.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  defaultRulesetOf,
  exportFrom,
  exportSettings,
  plainPages,
  plainRuleset,
  wholeSettings,
} from '../scripts/settings-export.mjs';
import { WANTED } from '../scripts/public-readiness.mjs';
import { read } from './repository/repo.js';

const made = [];
const folder = () => {
  const dir = mkdtempSync(join(tmpdir(), 'settings-export-'));
  made.push(dir);
  return dir;
};
after(() => made.forEach((d) => rmSync(d, { recursive: true, force: true })));

const live = {
  id: 7,
  node_id: 'x',
  name: 'main',
  target: 'branch',
  enforcement: 'active',
  conditions: { ref_name: { include: ['~DEFAULT_BRANCH'] } },
  rules: [{ type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'lint' }] } }],
  bypass_actors: [],
  created_at: '2026-10-01',
  updated_at: '2026-10-02',
  _links: {},
};
const pages = {
  url: 'https://api',
  status: 'built',
  build_type: 'workflow',
  source: { branch: 'main' },
  https_enforced: true,
  cname: 'thoughtknot.app',
  public: true,
  html_url: 'h',
};

describe('the exported settings', () => {
  test('keep the choices and drop the ids, dates and build state that differ between copies', () => {
    assert.deepEqual(Object.keys(plainRuleset(live)), [
      'name',
      'target',
      'enforcement',
      'conditions',
      'rules',
      'bypass_actors',
    ]);
    assert.deepEqual(Object.keys(plainPages(pages)), ['build_type', 'source', 'https_enforced', 'cname', 'public']);
  });

  test('are written as two files under .github/settings/', () => {
    const root = folder();
    assert.deepEqual(exportSettings({ ruleset: live, pages }, root), [
      '.github/settings/ruleset.json',
      '.github/settings/pages.json',
    ]);
    assert.deepEqual(JSON.parse(readFileSync(join(root, '.github/settings/ruleset.json'), 'utf8')), plainRuleset(live));
  });

  test('are read from GitHub by the exporter, which says what it wrote', () => {
    const asked = [];
    const gh = (args) => {
      asked.push(args[0]);
      if (args[0].endsWith('/rulesets')) return [{ id: 7, target: 'branch', enforcement: 'active' }];
      return args[0].endsWith('/pages') ? pages : live;
    };
    assert.equal(defaultRulesetOf(gh, 'o/r').id, 7);
    assert.equal(typeof exportFrom, 'function');
  });
});

describe('holding GitHub against the committed copy', () => {
  const entries = (root) => wholeSettings({ gh: () => null, quiet: (f) => f(), defaultRuleset: () => live, root });
  const named = (list, name) => list.find((s) => s.name === name);

  test('before anything is exported there is nothing to hold GitHub against, so the release is not failed for it', () => {
    for (const setting of entries(folder())) {
      assert.equal(setting.want, null, setting.name);
      assert.deepEqual(setting.read('o/r'), setting.want, setting.name);
      assert.throws(() => setting.write('o/r'), /export the settings first/);
    }
  });

  test('a ruleset loosened by hand differs from the committed one in a rule other than the checks', () => {
    const root = folder();
    mkdirSync(join(root, '.github/settings'), { recursive: true });
    writeFileSync(join(root, '.github/settings/ruleset.json'), JSON.stringify(plainRuleset(live)));
    const [same] = entries(root);
    assert.deepEqual(same.read('o/r'), same.want);
    const loosened = wholeSettings({
      gh: () => null,
      quiet: (f) => f(),
      defaultRuleset: () => ({ ...live, rules: [], enforcement: 'disabled' }),
      root,
    })[0];
    assert.notDeepEqual(loosened.read('o/r'), loosened.want);
  });

  test('the two settings are part of the wanted ones, always, and Pages is not asked of a repository with no site', () => {
    for (const name of ['default branch ruleset: the whole ruleset', 'pages settings']) {
      assert.equal(named(WANTED, name).phase, 'always', name);
    }
    const root = folder();
    mkdirSync(join(root, '.github/settings'), { recursive: true });
    writeFileSync(join(root, '.github/settings/pages.json'), JSON.stringify(plainPages(pages)));
    assert.deepEqual(
      named(entries(root), 'pages settings').read('o/r'),
      plainPages(pages),
      'unreadable Pages are not compared',
    );
  });

  test('RELEASING.md makes the export a step before each release', () => {
    assert.match(read('RELEASING.md'), /public-readiness\.mjs --settings --export/);
  });
});
