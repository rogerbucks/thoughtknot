#!/usr/bin/env node
// The iPhone app's keys (ES§40, ios_app, test_ios_app). Each device makes its own at first launch and keeps it in its
// Keychain, never in the app. So a signing expiry means only reinstalling, with the notes intact.
//
// Usage:
//   node scripts/ios-app-check.mjs keeper              build the keeper's Swift code with its tests, a fake store in
//                                                      place of the Keychain, and run them. macOS only.
//   node scripts/ios-app-check.mjs scan <app or dir>   look through a built app (a .app folder, or any folder) for key
//                                                      material. Exit 1 naming each find.
//   node scripts/ios-app-check.mjs simulator [<.app>]  the local check on this Mac, never in CI. On a simulator of its
//                                                      own: a first launch, then a reinstall as after a signing
//                                                      expiry. Without an app, it builds one for the simulator first
//                                                      (slow: about 15 minutes from cold). Prints a report to paste
//                                                      into the pull request.
//
// What the simulator run shows, step by step:
//   1. A fresh simulator ("ThoughtKnot keeper check", made once, wiped at each run) has no vault key.
//   2. Installed and launched once, the app makes the key: one item appears in the simulator's Keychain under
//      app.thoughtknot.vault-key, kept for this device only. Its value is stored sealed, never as the key's bytes.
//   3. A note is put in the app's Documents folder, where its notes live.
//   4. The app is signed afresh, ad hoc, so its signature differs as a new signing's would. It is installed over
//      itself, as a reinstall after a signing expiry is. Launched again, the note is unchanged and the Keychain still holds the
//      one same item: the key was found, not made again.
//   5. The app is deleted and installed again: the Keychain item is still there, so even a delete loses no key.
// What it cannot show: a real signing expiry and the phone's own file encryption (Data Protection), which only a real
// iPhone has. Those are left for Roger (requirements/editor-requirements.md, test_ios_app).
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEEPER = join(HERE, 'packages/app/src-tauri/keeper/ios');
const SRC_TAURI = join(HERE, 'packages/app/src-tauri');

export const BUNDLE_ID = 'app.thoughtknot.mobile';
export const KEY_SERVICE = 'app.thoughtknot.vault-key';
export const SIMULATOR = 'ThoughtKnot keeper check';

// Files Apple writes when it signs an app. They hold hashes of the app's files and public certificates, never a key.
const APPLE_SIGNATURE = new Set(['_CodeSignature', 'embedded.mobileprovision']);
// A file that is itself a key or a key store.
const KEY_FILE = /\.(p12|pfx|p8|pem|key|jks|keystore)$|^AuthKey_/i;

/**
 * The kinds of key material looked for, each with what it is. A match is a find unless `allowed` says the text
 * around it shows it is something else. Each is plain enough to read in a find.
 */
export const KINDS = [
  { what: 'a private key written out (PEM)', pattern: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----/g },
  { what: 'a private key as a JSON Web Key', pattern: /"kty"\s*:\s*"[A-Z]+"[^}]{0,400}?"d"\s*:\s*"[\w-]{20,}"/g },
  { what: 'a GitHub token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_\w{40,})/g },
  { what: 'an AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { what: 'an Anthropic API key', pattern: /\bsk-ant-[\w-]{20,}/g },
  {
    what: 'a 32-byte key in hex',
    pattern: /(?<![0-9a-fA-F])[0-9a-fA-F]{64}(?![0-9a-fA-F])/g,
    // SQLite's own source id: the date and time of its check-in, then its hash
    allowed: (before) => /\d{4}-\d\d-\d\d \d\d:\d\d:\d\d $/.test(before),
  },
  {
    what: 'a 32-byte key in base64',
    pattern: /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{43}=/g,
    // passed: a hash the page's content rules name ('sha256-…'), or words run together as in a compression dictionary.
    // A key has digits and capitals scattered through it.
    allowed: (before, found) =>
      /sha(?:256|384|512)-$/.test(before) ||
      (found.match(/\d/g) ?? []).length < 3 ||
      (found.match(/[A-Z]/g) ?? []).length < 3,
  },
];

/** Key material in some bytes, as [{ what, at, text }], `text` cut short so a find never prints a whole key. */
export function keyMaterialIn(bytes) {
  const text = Buffer.from(bytes).toString('latin1');
  const finds = [];
  for (const { what, pattern, allowed } of KINDS) {
    for (const match of text.matchAll(pattern)) {
      const before = text.slice(Math.max(0, match.index - 40), match.index);
      if (allowed?.(before, match[0])) continue;
      finds.push({ what, at: match.index, text: `${match[0].slice(0, 12)}…` });
    }
  }
  return finds;
}

function* filesUnder(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* filesUnder(path);
    else yield path;
  }
}

/** Every find in a built app or folder, as [{ file, what, at?, text? }], with `file` relative to `root`. */
export function scanApp(root) {
  const finds = [];
  for (const path of filesUnder(root)) {
    const file = relative(root, path);
    if (file.split('/').some((part) => APPLE_SIGNATURE.has(part))) continue;
    if (KEY_FILE.test(basename(path))) finds.push({ file, what: 'a file that is a key or a key store' });
    for (const find of keyMaterialIn(readFileSync(path))) finds.push({ file, ...find });
  }
  return finds;
}

/** Builds the keeper's Swift code with its tests and runs them, a fake store in place of the Keychain. */
export function runKeeperTests() {
  const out = mkdtempSync(join(tmpdir(), 'thoughtknot-keeper-'));
  try {
    const binary = join(out, 'keeper-tests');
    execFileSync(
      'swiftc',
      [
        '-parse-as-library',
        join(KEEPER, 'Sources/Keeper.swift'),
        join(KEEPER, 'Tests/KeeperTests.swift'),
        '-o',
        binary,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return spawnSync(binary, [], { encoding: 'utf8' });
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

// --- the simulator run, on this Mac only ---

const simctl = (...args) => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8' }).trim();

/** The check's own simulator, made the first time, on the newest iPhone the Mac has. */
function simulator() {
  const { devices } = JSON.parse(simctl('list', 'devices', '--json'));
  for (const list of Object.values(devices)) {
    const found = list.find((device) => device.name === SIMULATOR && device.isAvailable);
    if (found) return found.udid;
  }
  const { runtimes } = JSON.parse(simctl('list', 'runtimes', '--json'));
  const ios = runtimes.filter((runtime) => runtime.platform === 'iOS' && runtime.isAvailable).at(-1);
  if (!ios) throw new Error('no iOS simulator runtime is installed: add one in Xcode, Settings, Components');
  const iphone = ios.supportedDeviceTypes.filter((type) => type.productFamily === 'iPhone').at(-1);
  return simctl('create', SIMULATOR, iphone.identifier, ios.identifier);
}

/** The Apple team the app is signed for: the first part of its Keychain group. */
export function team(conf = readFileSync(join(SRC_TAURI, 'tauri.ios.conf.json'), 'utf8')) {
  return JSON.parse(conf).bundle.iOS.developmentTeam;
}

/**
 * The app's items in the simulator's Keychain, read from its database. The database keeps each item's name only as a
 * hash and its value sealed, so the app's items are found by their Keychain group. What is read is the sealed value,
 * never the key itself.
 */
export function keychainItems(udid, group, root = join(process.env.HOME, 'Library/Developer/CoreSimulator/Devices')) {
  const db = join(root, udid, 'data/Library/Keychains/keychain-2-debug.db');
  if (!existsSync(db)) return [];
  if (!/^[\w.-]+$/.test(group)) throw new Error(`not a Keychain group: ${group}`);
  const rows = execFileSync(
    'sqlite3',
    ['-readonly', '-json', db, `SELECT rowid, pdmn, cdat, hex(data) AS sealed FROM genp WHERE agrp = '${group}'`],
    { encoding: 'utf8' },
  ).trim();
  return rows ? JSON.parse(rows) : [];
}

/**
 * Signs a copy of the app again, as a fresh signing after an expiry would: ad hoc, with no certificate. The app's
 * Keychain group comes from the entitlements Xcode wrote into the app at build time. They name its team and its bundle
 * id, and a new signing keeps both. So the key stays the app's.
 */
function signed(app, dir, name) {
  const copy = join(dir, name, basename(app));
  cpSync(app, copy, { recursive: true });
  execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', copy], { stdio: 'ignore' });
  return copy;
}

/** Launches the app, gives the key a moment to be made beside the start, then stops it. Returns what it logged. */
function launch(udid) {
  simctl('launch', '--terminate-running-process', udid, BUNDLE_ID);
  execFileSync('sleep', ['8']);
  spawnSync('xcrun', ['simctl', 'terminate', udid, BUNDLE_ID]);
  return simctl(
    'spawn',
    udid,
    'log',
    'show',
    '--last',
    '20s',
    '--style',
    'compact',
    '--predicate',
    'process == "ThoughtKnot"',
  );
}

export function runSimulator(appPath) {
  const app = appPath ?? build();
  const group = `${team()}.${BUNDLE_ID}`;
  const lines = [];
  const step = (ok, what) => {
    lines.push(`${ok ? 'ok' : 'FAILED'} - ${what}`);
    console.log(lines.at(-1));
    return ok;
  };
  const scan = scanApp(app);
  step(
    scan.length === 0,
    `the built app holds no key (${scan.map((f) => `${f.file}: ${f.what}`).join('; ') || 'none found'})`,
  );

  const udid = simulator();
  spawnSync('xcrun', ['simctl', 'shutdown', udid]);
  simctl('erase', udid);
  simctl('boot', udid);
  simctl('bootstatus', udid, '-b');
  const work = mkdtempSync(join(tmpdir(), 'thoughtknot-ios-check-'));
  try {
    step(keychainItems(udid, group).length === 0, '1. a fresh simulator has no vault key');

    simctl('install', udid, signed(app, work, 'first-signing'));
    const log = launch(udid);
    const made = keychainItems(udid, group);
    step(made.length === 1, '2. the first launch makes the vault key: one item in the app’s Keychain group');
    step(made[0]?.pdmn === 'cku', '   kept for this device only, readable after its first unlock (cku)');
    step(made[0]?.sealed.length > 2 * 32 * 4, '   its value stored sealed by the Keychain, never as the bare key');
    step(
      log.includes('ThoughtKnot') && !log.includes('the vault key was not made'),
      '   and the app ran and logged no error making it',
    );

    const documents = join(simctl('get_app_container', udid, BUNDLE_ID, 'data'), 'Documents');
    const note = `# Kept\n\nWritten before the reinstall, ${new Date().toISOString()}.\n`;
    writeFileSync(join(documents, 'kept.md'), note);
    step(true, '3. a note is put in the app’s Documents folder');

    // signed afresh, as after a signing expiry: the same app with a new signature, installed over the old one
    simctl('install', udid, signed(app, work, 'second-signing'));
    launch(udid);
    const container = simctl('get_app_container', udid, BUNDLE_ID, 'data');
    const after = readFileSync(join(container, 'Documents/kept.md'), 'utf8');
    step(after === note, '4. after a reinstall signed afresh, the note is intact');
    const kept = keychainItems(udid, group);
    step(
      kept.length === 1 && kept[0].rowid === made[0].rowid && kept[0].sealed === made[0].sealed,
      '   and the Keychain holds the same one item: the key was found, not made again',
    );

    simctl('uninstall', udid, BUNDLE_ID);
    simctl('install', udid, signed(app, work, 'third-signing'));
    launch(udid);
    const survived = keychainItems(udid, group);
    step(
      survived.length === 1 && survived[0].sealed === made[0].sealed,
      '5. after the app is deleted and installed again, the Keychain still holds the same key',
    );
  } finally {
    spawnSync('xcrun', ['simctl', 'shutdown', udid]);
    rmSync(work, { recursive: true, force: true });
  }
  const failed = lines.filter((line) => line.startsWith('FAILED')).length;
  const device = simctl('list', 'devices', udid)
    .split('\n')
    .find((line) => line.includes(udid));
  console.log(`\n${failed ? `${failed} check(s) FAILED` : 'all simulator checks passed'}`);
  console.log(`simulator: ${device?.trim()}, ${new Date().toISOString().slice(0, 10)}`);
  return failed;
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
  } else if (command === 'simulator') {
    process.exitCode = runSimulator(path) ? 1 : 0;
  } else {
    console.error('usage: node scripts/ios-app-check.mjs keeper | scan <app or dir> | simulator [<.app>]');
    process.exitCode = 2;
  }
}
