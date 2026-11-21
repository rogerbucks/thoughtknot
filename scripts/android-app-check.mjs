#!/usr/bin/env node
// The Android app's keys (ES§40, android_app, test_android_app). Each device makes its own vault key at first launch,
// sealed by a key in the Android Keystore, and the app carries none.
//
// Usage:
//   node scripts/android-app-check.mjs keeper              build and run the keeper's rules and their tests.
//                                                          The rules are keeper/android/.../VaultKeys.kt. A fake
//                                                          store stands in for the Keystore. Needs kotlinc and Java,
//                                                          as the Android job in CI has. The real Keystore is tried
//                                                          there on an emulator.
//   node scripts/android-app-check.mjs scan <apk or dir>   look through a built app (an .apk or .aab, or a folder) for
//                                                          key material. Exit 1 naming each find.
//
// The look for keys is the iPhone check's (scripts/ios-app-check.mjs), on the app's files unpacked. Two things an
// Android build holds are passed, as they are not keys:
// - the files a v1 signature writes in META-INF: digests of the app's files and a public certificate;
// - the version hash of D8, the compiler that turns the app's Java into .dex. A debug build marks each class D8 makes
//   with it (its SynthesizedClassV2 annotation). It is read from the .dex itself, so only that exact value is passed.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { keyMaterialIn } from './ios-app-check.mjs';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEEPER = join(HERE, 'packages/app/src-tauri/keeper/android/src');

// A v1 signature's files: a manifest of digests, its signed copy, and the signing block with a public certificate.
const SIGNATURE = /^META-INF\/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))$/;
// A file that is itself a key or a key store.
const KEY_FILE = /\.(p12|pfx|p8|pem|key|jks|keystore)$|^AuthKey_/i;
const D8_MARK = 'Lcom/android/tools/r8/annotations/SynthesizedClassV2;';

// --- reading a .dex file, just far enough to find D8's version hash ---

function dexReader(bytes) {
  const b = Buffer.from(bytes);
  const u32 = (at) => b.readUInt32LE(at);
  const uleb = (at) => {
    let value = 0;
    let shift = 0;
    let byte;
    do {
      byte = b[at++];
      value |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);
    return [value >>> 0, at];
  };
  const string = (index) => {
    let [, at] = uleb(u32(u32(0x3c) + index * 4));
    const end = b.indexOf(0, at);
    return b.toString('latin1', at, end);
  };
  const type = (index) => string(u32(u32(0x44) + index * 4));
  return { b, u32, uleb, string, type };
}

/** The strings that D8 wrote as its own version hash in a .dex file. */
export function d8VersionHashes(bytes) {
  const dex = dexReader(bytes);
  const { b, u32, uleb, string, type } = dex;
  if (b.toString('latin1', 0, 4) !== 'dex\n') return new Set();
  const hashes = new Set();
  // one encoded value; returns where the next begins, noting a string when it is the hash of D8's mark
  const value = (at, note) => {
    const head = b[at++];
    const kind = head & 0x1f;
    const arg = head >> 5;
    if (kind === 0x1c) {
      let [size, next] = uleb(at);
      for (let i = 0; i < size; i++) next = value(next);
      return next;
    }
    if (kind === 0x1d) return annotation(at);
    if (kind === 0x1e || kind === 0x1f) return at;
    if (kind === 0x17 && note) {
      let index = 0;
      for (let i = 0; i <= arg; i++) index |= b[at + i] << (8 * i);
      note(string(index >>> 0));
    }
    return at + arg + 1;
  };
  const annotation = (at) => {
    let [typeIndex, next] = uleb(at);
    let size;
    [size, next] = uleb(next);
    const mark = type(typeIndex) === D8_MARK;
    for (let i = 0; i < size; i++) {
      let name;
      [name, next] = uleb(next);
      const keep = mark && string(name) === 'versionHash' ? (text) => hashes.add(text) : undefined;
      next = value(next, keep);
    }
    return next;
  };
  // the map list names where the annotation items are, and how many
  const map = u32(0x34);
  for (let i = 0; i < u32(map); i++) {
    const entry = map + 4 + i * 12;
    if (b.readUInt16LE(entry) !== 0x2004) continue;
    let at = u32(entry + 8);
    for (let n = 0; n < u32(entry + 4); n++) at = annotation(at + 1);
  }
  return hashes;
}

// --- the look through a built app ---

function* filesUnder(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* filesUnder(path);
    else yield path;
  }
}

/** Every find in a folder, as [{ file, what, at?, text? }], with `file` relative to `root`. */
export function scanFolder(root) {
  const finds = [];
  for (const path of filesUnder(root)) {
    const file = relative(root, path).split('\\').join('/');
    if (SIGNATURE.test(file)) continue;
    if (KEY_FILE.test(basename(path))) finds.push({ file, what: 'a file that is a key or a key store' });
    const bytes = readFileSync(path);
    const passed = file.endsWith('.dex') ? d8VersionHashes(bytes) : new Set();
    for (const find of keyMaterialIn(bytes)) {
      const found = bytes.toString('latin1', find.at, find.at + 64);
      if (passed.has(found)) continue;
      finds.push({ file, ...find });
    }
  }
  return finds;
}

/** Every find in a built app: an .apk or .aab, unpacked first, or a folder. */
export function scanApp(path) {
  if (statSync(path).isDirectory()) return scanFolder(path);
  const out = mkdtempSync(join(tmpdir(), 'thoughtknot-apk-'));
  try {
    execFileSync('unzip', ['-qq', '-o', path, '-d', out], { stdio: ['ignore', 'pipe', 'pipe'] });
    return scanFolder(out);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

/** Builds the keeper's rules with their tests and runs them, a fake store in place of the Keystore. */
export function runKeeperTests() {
  const out = mkdtempSync(join(tmpdir(), 'thoughtknot-keeper-'));
  try {
    const jar = join(out, 'keeper-tests.jar');
    execFileSync(
      'kotlinc',
      [
        join(KEEPER, 'main/java/VaultKeys.kt'),
        join(KEEPER, 'test/java/VaultKeysTest.kt'),
        '-include-runtime',
        '-d',
        jar,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return spawnSync('java', ['-cp', jar, 'app.thoughtknot.keeper.VaultKeysTestKt'], { encoding: 'utf8' });
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [command, path] = process.argv.slice(2);
  if (command === 'keeper') {
    const run = runKeeperTests();
    process.stdout.write(run.stdout);
    process.stderr.write(run.stderr);
    process.exitCode = run.status;
  } else if (command === 'scan' && path) {
    const finds = scanApp(path);
    for (const find of finds) console.log(`${find.file}: ${find.what}${find.text ? ` (${find.text})` : ''}`);
    console.log(finds.length ? `${finds.length} find(s)` : 'no key material found');
    process.exitCode = finds.length ? 1 : 0;
  } else {
    console.error('usage: node scripts/android-app-check.mjs keeper | scan <apk, aab or dir>');
    process.exitCode = 2;
  }
}
