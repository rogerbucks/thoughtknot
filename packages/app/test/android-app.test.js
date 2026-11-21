// The Android app's keys (ES§40, android_app, test_android_app). Each device makes its own vault key at first launch,
// sealed by a key in the Android Keystore, and the app carries none.
// What runs here, in the normal suite:
// - the keeper's rules (VaultKeys.kt) with their tests, a fake store in place of the Keystore. This needs Java and
//   kotlinc; elsewhere the Android phone job in .github/workflows/mobile-app.yml runs them, beside the real Keystore
//   on an emulator (KeeperTest.kt);
// - the look through a built app for key material, on planted keys, on what an Android build holds that is not a key,
//   and on what goes into the app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyMaterialIn } from '../../../scripts/ios-app-check.mjs';
import { d8VersionHashes, runKeeperTests, scanApp } from '../../../scripts/android-app-check.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const has = (command, flag) => spawnSync(command, [flag], { stdio: 'ignore' }).status === 0;
const hasKotlin = has('java', '-version') && has('kotlinc', '-version');
const hasZip = has('zip', '-v') && has('unzip', '-v');

/** A small .dex: its strings and types, one annotation item, and the map list that names it. */
function dex({ strings, types, annotation }) {
  const parts = [];
  const header = Buffer.alloc(0x70);
  header.write('dex\n035\0', 0, 'latin1');
  let at = header.length;
  const stringIds = Buffer.alloc(strings.length * 4);
  const typeIds = Buffer.alloc(types.length * 4);
  header.writeUInt32LE(strings.length, 0x38);
  header.writeUInt32LE(at, 0x3c);
  at += stringIds.length;
  header.writeUInt32LE(types.length, 0x40);
  header.writeUInt32LE(at, 0x44);
  at += typeIds.length;
  types.forEach((index, i) => typeIds.writeUInt32LE(index, i * 4));
  parts.push(header, stringIds, typeIds);
  strings.forEach((text, i) => {
    stringIds.writeUInt32LE(at, i * 4);
    const data = Buffer.concat([Buffer.from([text.length]), Buffer.from(text, 'latin1'), Buffer.from([0])]);
    parts.push(data);
    at += data.length;
  });
  const item = Buffer.from(annotation);
  const itemAt = at;
  parts.push(item);
  at += item.length;
  const map = Buffer.alloc(4 + 12);
  map.writeUInt32LE(1, 0);
  map.writeUInt16LE(0x2004, 4);
  map.writeUInt32LE(1, 8);
  map.writeUInt32LE(itemAt, 12);
  header.writeUInt32LE(at, 0x34);
  parts.push(map);
  return Buffer.concat(parts);
}

test(
  'the keeper makes the key at first launch, gives the same key after, and never replaces one it cannot open',
  { skip: hasKotlin ? false : 'needs Java and kotlinc: the Android phone job runs it' },
  () => {
    const run = runKeeperTests();
    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
    for (const check of [
      'the first ask makes a key of 32 bytes',
      'a second ask gives the same key',
      "what is written never holds the key's bytes",
      'another device makes another key',
      'a store that cannot be read gives an error, not a new key',
      'a sealed copy whose sealing key is gone gives an error',
      'and no new sealing key or vault key is made',
      'a sealed copy that does not open gives an error',
      'and is never written over',
      'a key the store cannot keep is not handed out',
    ])
      assert.match(run.stdout, new RegExp(`^ok - ${check}$`, 'm'));
    assert.match(run.stdout, /^all keeper checks passed$/m);
  },
);

test('the keeper seals its key with one in the Keystore, keeps it off backups, and holds its rules apart', () => {
  const keys = read('packages/app/src-tauri/keeper/android/src/main/java/VaultKeys.kt');
  assert.match(keys, /random\.nextBytes\(fresh\)/, 'made on the device');
  assert.match(keys, /store\.existing\(\) \?: throw KeeperException/, 'a sealed copy never gets a new sealing key');
  assert.doesNotMatch(keys, /^import android\./m, 'built and tested without Android');
  const keeper = read('packages/app/src-tauri/keeper/android/src/main/java/Keeper.kt');
  assert.match(keeper, /KeyStore\.getInstance\(Keeper\.STORE\)/);
  assert.match(keeper, /KeyGenerator\.getInstance\(KeyProperties\.KEY_ALGORITHM_AES, Keeper\.STORE\)/);
  assert.match(keeper, /File\(context\.noBackupFilesDir, FILE\)/);
  assert.doesNotMatch(keeper, /SecureRandom/, 'the key is made by the rules, not beside them');
  const plugin = read('packages/app/src-tauri/keeper/android/src/main/java/KeeperPlugin.kt');
  assert.match(plugin, /Keeper\(activity\.applicationContext\)\.vaultKey\(\)/);
  assert.doesNotMatch(plugin, /KeyStore/, 'the Keystore is the keeper’s alone');
});

test('the look through an Android app finds each kind of key planted in it, in a folder or an .apk', () => {
  const dir = mkdtempSync(join(tmpdir(), 'thoughtknot-scan-'));
  try {
    // put together here, so the repository's own secrets scan never reads a key in this file
    const pem = ['BEGIN', 'END'].map((edge) => `-----${edge} RSA ${'PRIVATE'} KEY-----`);
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets/pem.txt'), `${pem[0]}\nMIIE...\n${pem[1]}\n`);
    writeFileSync(join(dir, 'assets/hex.js'), `const vault = "${'5c'.repeat(32)}";`);
    writeFileSync(join(dir, 'upload.jks'), 'binary');
    // the files a v1 signature writes are digests and a public certificate, never a key
    mkdirSync(join(dir, 'META-INF'));
    writeFileSync(join(dir, 'META-INF/CERT.SF'), 'SHA-256-Digest: Bay+YQjw8SONfdlRdYdXfDBkglJwQVw7kpq3RDIQkD0=\n');
    writeFileSync(join(dir, 'META-INF/MANIFEST.MF'), 'SHA-256-Digest: EHmAxUJ01y+2BOHoLvTwgg3kW53TbNWJnCD5cvjOtYI=\n');
    const expected = [
      'assets/hex.js: a 32-byte key in hex',
      'assets/pem.txt: a private key written out (PEM)',
      'upload.jks: a file that is a key or a key store',
    ];
    assert.deepEqual(
      scanApp(dir)
        .map((find) => `${find.file}: ${find.what}`)
        .sort(),
      expected,
    );
    if (hasZip) {
      const apk = join(tmpdir(), `thoughtknot-scan-${process.pid}.apk`);
      try {
        assert.equal(spawnSync('zip', ['-q', '-r', apk, '.'], { cwd: dir }).status, 0);
        assert.deepEqual(
          scanApp(apk)
            .map((find) => `${find.file}: ${find.what}`)
            .sort(),
          expected,
        );
      } finally {
        rmSync(apk, { force: true });
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the look through an Android app passes D8’s own version hash, and only that, in a .dex', () => {
  // D8 marks each class it makes with SynthesizedClassV2, whose versionHash is the hash of D8's own build
  const hash = '3b119036505a817327d30bbe4a430e8676906c2ab0a3363856806bcd3b289007';
  const planted = 'e1'.repeat(32);
  const strings = ['Lcom/android/tools/r8/annotations/SynthesizedClassV2;', 'versionHash', hash, planted];
  // visibility, then the annotation: its type, one element, named versionHash, the string at index 2
  const marked = dex({ strings, types: [0], annotation: [0x02, 0, 1, 1, 0x17, 2] });
  assert.deepEqual([...d8VersionHashes(marked)], [hash]);
  assert.equal(keyMaterialIn(marked).length, 2, 'both look like keys to the look alone');
  const dir = mkdtempSync(join(tmpdir(), 'thoughtknot-scan-'));
  try {
    writeFileSync(join(dir, 'classes.dex'), marked);
    const finds = scanApp(dir);
    assert.deepEqual(
      finds.map((find) => `${find.file}: ${find.what}`),
      ['classes.dex: a 32-byte key in hex'],
    );
    assert.equal(marked.toString('latin1', finds[0].at, finds[0].at + 64), planted, 'a key beside the hash is found');
    // the same hash, named by any other annotation, is not passed
    const other = dex({
      strings: ['Lapp/thoughtknot/Mark;', 'versionHash', hash],
      types: [0],
      annotation: [0x02, 0, 1, 1, 0x17, 2],
    });
    assert.deepEqual([...d8VersionHashes(other)], []);
    writeFileSync(join(dir, 'classes.dex'), other);
    assert.equal(scanApp(dir).length, 1);
    // a file that is not a .dex passes nothing
    assert.deepEqual([...d8VersionHashes(Buffer.from(`not a dex ${hash}`))], []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('what goes into the Android app holds no key', () => {
  for (const dir of ['packages/app/src-tauri/keeper/android', 'packages/app/src-tauri/icons'])
    assert.deepEqual(scanApp(join(ROOT, dir)), [], dir);
  for (const file of ['tauri.android.conf.json', 'tauri.conf.json', 'capabilities/default.json'])
    assert.deepEqual(keyMaterialIn(readFileSync(join(ROOT, 'packages/app/src-tauri', file))), [], file);
});

test('the keeper and the built Android app are both looked through in CI', () => {
  const workflow = read('.github/workflows/mobile-app.yml');
  assert.match(workflow, /- run: node scripts\/android-app-check\.mjs keeper\n/);
  assert.match(
    workflow,
    /- run: node scripts\/android-app-check\.mjs scan packages\/app\/src-tauri\/gen\/android\/app\/build\/outputs\/apk\/universal\/debug\/app-universal-debug\.apk\n/,
  );
  assert.match(
    workflow,
    /paths:\n(?:\s+- '[^']+'\n)*?\s+- 'scripts\/android-app-check\.mjs'\n/,
    'a change to the check runs it',
  );
});
