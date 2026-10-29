// The plugin passes Obsidian's community plugin review checklist (spec §41, community_listing). The checklist is
// Obsidian's own: the manifest rules, the version file, the release assets and the code rules the review bot runs.
// - The manifest, versions.json and the three release assets are read here.
// - The code rules are the `eslint-plugin-obsidianmd` rules. This test holds that lint runs on them in CI, with
//   none turned off for the plugin's own code.
// - RELEASING.md holds the entry Roger files with Obsidian, and this test holds it to the manifest.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { exists, read, readJSON } from './repository/repo.js';

const manifest = readJSON('manifest.json');
const SEMVER = /^\d+\.\d+\.\d+$/;

describe('manifest.json follows the review rules', () => {
  test('the id is lower case, has no "obsidian" and does not end in "plugin"', () => {
    assert.match(manifest.id, /^[a-z0-9-]+$/);
    assert.doesNotMatch(manifest.id, /obsidian/);
    assert.doesNotMatch(manifest.id, /plugin$/);
  });

  test('the name is the product name, with no "Obsidian" and no "plugin" in it', () => {
    assert.equal(manifest.name, 'ThoughtKnot');
    assert.doesNotMatch(manifest.name, /obsidian|plugin/i);
  });

  test('the description is one sentence of 250 characters or fewer, ending in a full stop, never starting "This plugin"', () => {
    assert.ok(manifest.description.length <= 250, `${manifest.description.length} characters`);
    assert.match(manifest.description, /[.?!)]$/);
    assert.doesNotMatch(manifest.description, /^this (plugin|app)/i);
    assert.doesNotMatch(manifest.description, /obsidian/i);
  });

  test('the version, the minimum app version, the author and its link are set', () => {
    assert.match(manifest.version, SEMVER);
    assert.match(manifest.minAppVersion, SEMVER);
    assert.ok(manifest.author);
    assert.match(manifest.authorUrl, /^https:\/\//);
    assert.doesNotMatch(manifest.authorUrl, /obsidian\.md/);
    assert.equal(typeof manifest.isDesktopOnly, 'boolean');
  });

  test('a plug-in that is not desktop only uses no Node module outside the editor server', () => {
    assert.equal(manifest.isDesktopOnly, false);
    const eslint = read('eslint.config.mjs');
    assert.match(eslint, /obsidianmd\.configs\.recommended/);
    const offFor = [...eslint.matchAll(/files: \[([^\]]*)\][^}]*?'obsidianmd\/no-nodejs-modules': 'off'/g)].map(
      (m) => m[1],
    );
    for (const files of offFor) assert.doesNotMatch(files, /packages\/(obsidian|core)\b/, files);
  });
});

describe('versions.json and the release assets', () => {
  test('versions.json maps this version to the minimum app version, and every version to a semantic one', () => {
    const versions = readJSON('versions.json');
    assert.equal(versions[manifest.version], manifest.minAppVersion);
    for (const [version, minimum] of Object.entries(versions)) {
      assert.match(version, SEMVER);
      assert.match(minimum, SEMVER);
    }
  });

  test('the release workflow attaches main.js, manifest.json and styles.css to a tag that is the bare version', () => {
    const release = read('.github/workflows/release.yml');
    assert.match(release, /gh release create "\$GITHUB_REF_NAME" main\.js manifest\.json styles\.css/);
    assert.match(release, /test "\$GITHUB_REF_NAME" = "\$\(node -p "require\('\.\/manifest\.json'\)\.version"\)"/);
    assert.ok(exists('styles.css'));
  });

  test('the version in the manifest is the one in package.json', () => {
    assert.equal(readJSON('package.json').version, manifest.version);
  });
});

describe('the repository files the review reads', () => {
  test('a README, a licence and a security policy are present', () => {
    assert.ok(read('README.md').trim().length > 0);
    assert.match(read('LICENSE'), /Mozilla Public License/);
    assert.ok(exists('SECURITY.md'));
  });

  test('the README says what the plug-in does, how to install it and what leaves the device', () => {
    const readme = read('README.md');
    assert.match(readme, /install/i);
    assert.match(readme, /network|offline|send|leaves/i);
  });

  test('CI runs the review rules on the plug-in: lint is a CI job, and the plug-in is not ignored by it', () => {
    assert.match(read('.github/workflows/ci.yml'), /run: npm run lint/);
    assert.doesNotMatch(read('eslint.config.mjs'), /ignores:[^\]]*packages\/obsidian\/src/);
  });
});

describe('the entry filed with Obsidian', () => {
  test('RELEASING.md holds the community-plugins.json entry, equal to the manifest and the repository', () => {
    const text = read('RELEASING.md');
    const at = text.indexOf('## Listing in the community directory');
    assert.ok(at !== -1, 'RELEASING.md has a "Listing in the community directory" section');
    const block = /```json\n([\s\S]*?)\n```/.exec(text.slice(at));
    assert.ok(block, 'the section holds the entry as a json block');
    assert.deepEqual(JSON.parse(block[1]), {
      id: manifest.id,
      name: manifest.name,
      author: manifest.author,
      description: manifest.description,
      repo: 'rogerbucks/thoughtknot',
    });
  });
});
