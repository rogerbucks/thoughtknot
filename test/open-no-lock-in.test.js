// Open, with no lock-in (editor spec §40, open_no_lock_in). The library is open source with no vendor lock-in, and is
// usable on mobile, desktop and the web, at work and at home.
// - Its licence is open: MPL-2.0 for every package, and only open licences among what it carries at run time.
// - No proprietary runtime dependency: no vendor's SDK, and no vendor's address in its code.
// - Its builds run on each platform. The library reaches no Node, Obsidian, Electron or VS Code module, so it runs in
//   a page and on a phone. CI builds the desktop app on Linux, macOS and Windows, and the phone app for Android and
//   iOS. The web layer is static files.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { exists, read, readJSON, walk, workflowFiles } from './repository/repo.js';
import { bundledPackages, licenceAllowed } from './repository/licences.js';

// the library, as lib_github_release names it, and the two packages that put it at work and on the web
const LIBRARY = ['packages/graph-spec', 'packages/core', 'packages/sync', 'packages/boundary', 'packages/web'];
const VENDOR_SDK =
  /^(@azure\/|@microsoft\/|@pnp\/|@aws-sdk\/|aws-sdk$|googleapis$|@google-cloud\/|firebase|@salesforce\/|@atlassian\/)/;
const VENDOR_HOST =
  /\b(graph\.microsoft\.com|sharepoint\.com|amazonaws\.com|googleapis\.com|firebaseio\.com|azure\.com)\b/;
const HOST_ONLY =
  /(?:from\s+|require\()\s*['"](node:[\w/]+|fs|path|os|http|https|net|child_process|electron|obsidian|vscode)['"]/;
const code = (pkg) => walk(`${pkg}/src`).filter((f) => /\.(ts|js|mjs|cjs)$/.test(f));

describe('open_no_lock_in', () => {
  // proves: open_no_lock_in
  test('the library’s licence is open, and so is all it carries at run time', () => {
    assert.match(read('LICENSE'), /^Mozilla Public License Version 2\.0/);
    for (const p of LIBRARY) assert.equal(readJSON(`${p}/package.json`).license, 'MPL-2.0', p);
    for (const p of bundledPackages())
      if (!p.name.startsWith('@thoughtknot/') && p.licence)
        assert.ok(licenceAllowed(p.licence), `${p.name}: ${p.licence}`);
    for (const [name, rec] of Object.entries(readJSON('licences/bundled.json').packages))
      assert.ok(licenceAllowed(rec.licence), `${name} carries ${rec.licence}`);
  });

  // proves: open_no_lock_in
  test('it has no proprietary runtime dependency: no vendor SDK and no vendor address', () => {
    for (const p of LIBRARY) {
      const deps = Object.keys(readJSON(`${p}/package.json`).dependencies ?? {});
      for (const d of deps) assert.doesNotMatch(d, VENDOR_SDK, `${p} depends on ${d}`);
      for (const f of code(p)) assert.doesNotMatch(read(f), VENDOR_HOST, `${f} names a vendor's address`);
    }
  });

  // proves: open_no_lock_in
  test('its builds run on each platform: page, phone, desktop and web', () => {
    for (const p of LIBRARY)
      for (const f of code(p)) assert.doesNotMatch(read(f), HOST_ONLY, `${f} reaches one host's module`);
    const workflows = workflowFiles().map(read).join('\n');
    for (const os of ['ubuntu', 'macos', 'windows'])
      assert.match(read('.github/workflows/desktop-app.yml'), new RegExp(os));
    assert.match(workflows, /cargo tauri android build/);
    assert.match(workflows, /cargo tauri ios build/);
    assert.ok(exists('packages/web/src/site.ts'), 'the web layer');
  });
});
