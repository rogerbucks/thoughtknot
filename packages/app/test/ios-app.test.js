// The iPhone app's keys (ES§40, ios_app, test_ios_app). Each device makes its own at first launch and keeps it in its
// Keychain, never in the app. So a signing expiry means only reinstalling, with the notes intact.
// What runs here, in the normal suite:
// - the keeper's Swift code with its tests, a fake store in place of the Keychain. This needs a Mac with Swift;
//   elsewhere the macOS phone job in .github/workflows/mobile-app.yml runs them.
// - the look through a built app for key material, on planted keys and on what goes into the app;
// - that the real first launch and reinstall stay a local check on Roger's Mac (scripts/ios-app-check.mjs simulator),
//   never a CI job.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyMaterialIn, runKeeperTests, scanApp, team } from '../../../scripts/ios-app-check.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const hasSwift = process.platform === 'darwin' && spawnSync('swiftc', ['--version']).status === 0;

test(
  'the keeper makes the key at first launch, gives the same key after, and never replaces one it cannot read',
  {
    skip: hasSwift ? false : 'needs Swift on a Mac: the macOS phone job runs it',
  },
  () => {
    const run = runKeeperTests();
    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
    for (const check of [
      'the first ask makes a key of 32 bytes',
      'a second ask gives the same key',
      'another device makes another key',
      'a locked store gives an error, not a new key',
      'a key the store cannot keep is not handed out',
    ])
      assert.match(run.stdout, new RegExp(`^ok - ${check}$`, 'm'));
    assert.match(run.stdout, /^all keeper checks passed$/m);
  },
);

test('the keeper keeps its key in the Keychain for this device only, and its plug-in only asks it', () => {
  const keeper = read('packages/app/src-tauri/keeper/ios/Sources/Keeper.swift');
  assert.match(keeper, /kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly/);
  assert.match(keeper, /SecRandomCopyBytes\(kSecRandomDefault, keyBytes, &fresh\)/, 'made on the device');
  assert.match(keeper, /if status == errSecItemNotFound \{ return nil \}\n\s+throw KeeperError\.store\(status\)/);
  assert.doesNotMatch(keeper, /import Tauri/, 'built and tested on a Mac without Tauri');
  const plugin = read('packages/app/src-tauri/keeper/ios/Sources/KeeperPlugin.swift');
  assert.match(plugin, /Kept\(key: try Keeper\.vaultKey\(\)\)/);
  assert.doesNotMatch(plugin, /SecItem/, 'the Keychain is the keeper’s alone');
});

test('the look through an app finds each kind of key planted in it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'thoughtknot-scan-'));
  try {
    const hex = 'a3'.repeat(32);
    const base64 = 'Q7r9Zk2mX4pL8vN1wB6cT0yH5jF3sD9gK2aE7uR1oPq=';
    // put together here, so the repository's own secrets scan never reads a key in this file
    const pem = ['BEGIN', 'END'].map((edge) => `-----${edge} EC ${'PRIVATE'} KEY-----`);
    writeFileSync(join(dir, 'pem.txt'), `${pem[0]}\nMHc...\n${pem[1]}\n`);
    writeFileSync(join(dir, 'hex.js'), `const vault = "${hex}";`);
    writeFileSync(join(dir, 'b64.js'), `const vault = '${base64}';`);
    writeFileSync(join(dir, 'jwk.json'), '{"kty":"EC","crv":"P-256","d":"x9Rk2TqLm4Vb7Nc1Zp8Wj3Hs6Yd0Fg5Ka2E"}');
    mkdirSync(join(dir, 'certs'));
    writeFileSync(join(dir, 'certs/signing.p12'), 'binary');
    writeFileSync(join(dir, 'token.txt'), `ghp_${'A1b2C3d4'.repeat(4)}abcd`);
    const finds = scanApp(dir).map((find) => `${find.file}: ${find.what}`);
    assert.deepEqual(finds.sort(), [
      'b64.js: a 32-byte key in base64',
      'certs/signing.p12: a file that is a key or a key store',
      'hex.js: a 32-byte key in hex',
      'jwk.json: a private key as a JSON Web Key',
      'pem.txt: a private key written out (PEM)',
      'token.txt: a GitHub token',
    ]);
    for (const find of scanApp(dir)) assert.ok(!find.text || find.text.length <= 13, 'a find never prints a key');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the look through an app passes what a built app holds that is not a key', () => {
  // SQLite's source id, a content-rule hash and compression-dictionary words, each seen in the built iPhone app
  const sqlite = 'fts5: 2026-10-16 14:45:20 555e07ef33f69a0957d24d8e555b702464a131d6f1607f4c3c1e4551e8e6ca76 rtree';
  const csp = "'sha256-LeOQbzaSbi2SgabWvIFa7uHC00p8saYyvwPkAv8fRRw='";
  const words = 'ncallbackseparateprojectsconflicthardwareinterestdeliverymountainobtained= false';
  assert.deepEqual(keyMaterialIn(Buffer.from(`${sqlite}\n${csp}\n${words}`)), []);
  // Apple's signature: hashes of the app's files and public certificates, never a key
  const dir = mkdtempSync(join(tmpdir(), 'thoughtknot-scan-'));
  try {
    mkdirSync(join(dir, '_CodeSignature'));
    writeFileSync(
      join(dir, '_CodeSignature/CodeResources'),
      '<data>Bay+YQjw8SONfdlRdYdXfDBkglJwQVw7kpq3RDIQkD0=</data>',
    );
    writeFileSync(join(dir, 'embedded.mobileprovision'), 'EHmAxUJ01y+2BOHoLvTwgg3kW53TbNWJnCD5cvjOtYI=');
    assert.deepEqual(scanApp(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('what goes into the iPhone app holds no key', () => {
  for (const dir of ['packages/app/src-tauri/keeper/ios', 'packages/app/src-tauri/ios', 'packages/app/src-tauri/icons'])
    assert.deepEqual(scanApp(join(ROOT, dir)), [], dir);
  for (const file of ['Info.ios.plist', 'tauri.ios.conf.json', 'tauri.conf.json', 'capabilities/default.json'])
    assert.deepEqual(keyMaterialIn(readFileSync(join(ROOT, 'packages/app/src-tauri', file))), [], file);
  // the window's pages, when built (the app carries them inside its binary)
  const dist = join(ROOT, 'packages/app/dist');
  if (existsSync(dist)) assert.deepEqual(scanApp(dist), [], 'packages/app/dist');
});

test('the built iPhone app is looked through in CI, and the simulator run stays a local check', () => {
  const workflow = read('.github/workflows/mobile-app.yml');
  assert.match(workflow, /- run: node scripts\/ios-app-check\.mjs keeper\n/);
  assert.match(
    workflow,
    /- run: node scripts\/ios-app-check\.mjs scan packages\/app\/src-tauri\/gen\/apple\/build\/arm64-sim\/ThoughtKnot\.app\n/,
  );
  assert.match(
    workflow,
    /paths:\n(?:\s+- '[^']+'\n)*?\s+- 'scripts\/ios-app-check\.mjs'\n/,
    'a change to the check runs it',
  );
  for (const path of ['.github/workflows/mobile-app.yml', '.github/workflows/ci.yml', '.github/workflows/nightly.yml'])
    assert.doesNotMatch(read(path), /ios-app-check\.mjs simulator/, `${path} never runs the simulator check`);
  // the check's own guide says how to run it, and the Keychain group is the team's and the app's
  const check = read('scripts/ios-app-check.mjs');
  assert.match(check, /node scripts\/ios-app-check\.mjs simulator \[<\.app>\]/);
  assert.equal(team(), '498L23FMB2');
});
