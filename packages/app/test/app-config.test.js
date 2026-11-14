// The desktop app is shut by default (spec §41, standalone_app; offline). Its window may load only its own pages and
// reach no other origin. It calls ten folder commands, one gh command, six mesh commands and eight note commands. It
// also calls one that looks for a mesh VPN address, and two for the store of notes read in parts.
// The Rust, the build script and the window's capability must name the same twenty-eight. So no new one slips through.
// The gh command runs only the calls on its list, by gh's own path, with no shell (spec §48, github_repo_access).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const config = JSON.parse(read('src-tauri/tauri.conf.json'));
const COMMANDS = [
  'pick_folder',
  'own_folder',
  'read_dir',
  'read_text',
  'write_text',
  'remove_file',
  'make_dir',
  'write_new',
  'pick_target',
  'swap_folders',
  'run_gh',
  'mesh_listen',
  'mesh_accept',
  'mesh_dial',
  'mesh_send',
  'mesh_receive',
  'mesh_close',
  'crdt_open',
  'crdt_text',
  'crdt_splice',
  'crdt_merge',
  'crdt_has_been',
  'crdt_anchor',
  'crdt_place',
  'crdt_history',
  'machine_found',
  'parts_write',
  'parts_read',
];

test("the window's policy allows its own pages and Tauri's calls, and no other origin", () => {
  const policy = Object.fromEntries(
    config.app.security.csp
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .map(([k, ...v]) => [k, v]),
  );
  assert.deepEqual(policy['default-src'], ["'self'"]);
  assert.deepEqual(policy['script-src'], ["'self'"]);
  assert.doesNotMatch(
    config.app.security.csp,
    /wasm-unsafe-eval|unsafe-eval/,
    'the window runs no WebAssembly (Roger, 8 Nov)',
  );
  assert.deepEqual(policy['connect-src'], ["'self'", 'ipc:', 'http://ipc.localhost']);
  assert.deepEqual(policy['object-src'], ["'none'"]);
  assert.ok(!/https?:\/\/(?!ipc\.localhost)/.test(config.app.security.csp), "no web address but Tauri's own");
  assert.equal(config.build.devUrl, undefined, 'the window never loads a page from a server');
  assert.equal(config.app.security.freezePrototype, true);
});

test('the commands in the Rust, the build script and the capability are the same twenty-eight', () => {
  const handled = /generate_handler!\[([^\]]*)\]/
    .exec(read('src-tauri/src/lib.rs'))[1]
    .split(',')
    .map((s) => s.trim());
  const built = /let commands = &\[([^\]]*)\]/
    .exec(read('src-tauri/build.rs'))[1]
    .match(/"([a-z_]+)"/g)
    .map((s) => s.slice(1, -1));
  const capability = JSON.parse(read('src-tauri/capabilities/default.json'));
  const allowed = capability.permissions
    .filter((p) => p.startsWith('allow-'))
    .map((p) => p.slice(6).replace(/-/g, '_'));
  assert.deepEqual(
    [handled, built, allowed].map((l) => [...l].sort()),
    Array(3).fill([...COMMANDS].sort()),
  );
  assert.deepEqual(
    capability.permissions.filter((p) => !p.startsWith('allow-')),
    ['core:default'],
  );
});

test('the gh command checks each call against its list before gh starts, and starts gh alone, with no shell', () => {
  const lib = read('src-tauri/src/lib.rs');
  const command = /async fn run_gh\(args: Vec<String>, input: Option<String>\)[^{]*\{([\s\S]*?)\n\}/.exec(lib)[1];
  assert.ok(command.indexOf('gh::refusal(') >= 0 && command.indexOf('gh::refusal(') < command.indexOf('gh::run('));
  const gh = read('src-tauri/src/gh.rs');
  assert.deepEqual(
    [...gh.matchAll(/Command::new\(([^)]*)\)/g)].map(([, what]) => what),
    ['gh'],
    'one program, by the path found for gh',
  );
  assert.doesNotMatch(gh, /"(?:sh|bash|cmd|cmd\.exe|powershell)"|\/bin\/sh/, 'no shell is named');
  assert.match(
    gh,
    /include_str!\("\.\.\/\.\.\/\.\.\/core\/test\/fixtures\/gh-calls\.json"\)/,
    'the Rust tests the core’s cases',
  );
  assert.match(
    lib,
    /#\[cfg\(mobile\)\]\n#\[tauri::command\]\nasync fn run_gh[\s\S]*?Err\("computer-only"/,
    'a phone runs no gh',
  );
});

test('the app takes no plug-in that reaches the disk, the network or a shell on its own, and pins each crate', () => {
  const cargo = read('src-tauri/Cargo.toml');
  const crates = [...cargo.matchAll(/^([a-z][\w-]*)\s*=\s*(?:"([^"]*)"|\{\s*version\s*=\s*"([^"]*)")/gm)].map(
    ([, name, a, b]) => [name, a ?? b],
  );
  const plugins = crates.map(([n]) => n).filter((n) => n.startsWith('tauri-plugin-'));
  assert.deepEqual(plugins, ['tauri-plugin-keeper', 'tauri-plugin-dialog']);
  assert.match(
    cargo,
    /^tauri-plugin-keeper = \{ version = "=[\d.]+", path = "keeper" \}$/m,
    'the keeper is the app’s own',
  );
  for (const [name, version] of crates.filter(([n]) => n.startsWith('tauri')))
    assert.match(version, /^=\d+\.\d+\.\d+$/, `${name} is pinned to one version`);
});

test('the one advisory the dependency review allows is for glib 0.18, and goes once Tauri moves past it (SEC-16)', () => {
  const review = readFileSync(new URL('../../../.github/workflows/dependency-review.yml', import.meta.url), 'utf8');
  const allowed = [...review.matchAll(/^\s*allow-ghsas:\s*(.+)$/gm)].flatMap(([, ids]) => ids.split(/[\s,]+/));
  assert.deepEqual(allowed, ['GHSA-wrw7-89jp-8q8g'], 'only this one advisory, by its id');
  assert.match(review, /fail-on-severity: low/, 'the severity level is not lowered');
  // Tauri draws Linux windows with GTK 3, which pins glib 0.18. When Tauri supports GTK 4, glib moves on, and this fails
  // until the allowance is taken out of the workflow and SEC-16 is closed.
  const glib = [...read('src-tauri/Cargo.lock').matchAll(/name = "glib"\nversion = "([^"]+)"/g)].map(([, v]) => v);
  assert.ok(
    glib.some((v) => v.startsWith('0.18.')),
    'glib 0.18 is gone: remove GHSA-wrw7-89jp-8q8g from .github/workflows/dependency-review.yml and close SEC-16',
  );
});

test('CI builds an installer for each system, through the signing script, and none on Linux that carries WebKitGTK', () => {
  // a .dmg on macOS, an NSIS installer on Windows and a .deb on Linux. An AppImage carries WebKitGTK (LGPL), so it
  // waits for the licence check that the desktop libraries' allowance names (licences/bundled.json).
  assert.equal(config.bundle.active, true);
  assert.deepEqual([...config.bundle.targets].sort(), ['app', 'deb', 'dmg', 'nsis']);
  const workflow = readFileSync(new URL('../../../.github/workflows/desktop-app.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cargo install tauri-cli --locked --version \d+\.\d+\.\d+\n/, 'the Tauri CLI is pinned');
  // scripts/desktop-build.mjs compiles with `cargo tauri build --ci --no-bundle`, then bundles; the keys come only off pull requests (app_signed, SEC-17)
  assert.match(workflow, /run: node scripts\/desktop-build\.mjs compile\n/);
  assert.match(workflow, /run: node scripts\/desktop-build\.mjs bundle\n/);
  for (const kind of ['dmg/\\*\\.dmg', 'nsis/\\*\\.exe', 'deb/\\*\\.deb'])
    assert.match(workflow, new RegExp(`target/release/bundle/${kind}\\n`), `the ${kind} installer is kept`);
  assert.doesNotMatch(workflow, /appimage/i, 'no AppImage');
  assert.doesNotMatch(workflow + JSON.stringify(config), /signCommand|AZURE_/, 'Windows unsigned (Roger, 23 Oct 2026)');
});

test('the app is built before its Rust tests, so no packed window file is half-written', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/desktop-app.yml', import.meta.url), 'utf8');
  const build = workflow.indexOf('run: cargo build --locked'),
    rust = workflow.indexOf('run: cargo test --locked');
  assert.ok(build > 0 && rust > 0, 'both steps are there');
  assert.ok(build < rust, 'the build comes first: cargo test compiles the library twice at once');
});

test('the phone and tablet app has an id of its own under thoughtknot.app, and its notes show in the Files app', () => {
  const android = JSON.parse(read('src-tauri/tauri.android.conf.json'));
  const ios = JSON.parse(read('src-tauri/tauri.ios.conf.json'));
  assert.equal(android.identifier, 'app.thoughtknot.mobile');
  assert.equal(ios.identifier, android.identifier, 'one id on both, as one app');
  const plist = read('src-tauri/Info.ios.plist');
  for (const key of ['UIFileSharingEnabled', 'LSSupportsOpeningDocumentsInPlace'])
    assert.match(plist, new RegExp(`<key>${key}</key>\\s*<true/>`), `${key} is on`);
});

test("the iPhone app answers Apple's encryption question as built-in only, so a TestFlight build needs no manual answer (LEGAL-3)", () => {
  const plist = read('src-tauri/Info.ios.plist');
  assert.match(plist, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/, "only Apple's own encryption");
});

test('the folder dialog is a computer’s only: a phone build carries no dialog plug-in', () => {
  const cargo = read('src-tauri/Cargo.toml');
  const desktopOnly = cargo.indexOf(`[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]`);
  assert.ok(desktopOnly > 0, 'a section for computers only');
  assert.ok(cargo.indexOf('tauri-plugin-dialog') > desktopOnly, 'the dialog sits in it');
  assert.match(read('src-tauri/src/lib.rs'), /#\[cfg_attr\(mobile, tauri::mobile_entry_point\)\]\npub fn run\(\)/);
});

test('CI builds the Android app and the iPhone simulator app, with no key of Roger’s (mobile_checked)', () => {
  const workflow = readFileSync(new URL('../../../.github/workflows/mobile-app.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cargo tauri android build --ci --debug --apk --target aarch64\n/);
  assert.match(workflow, /cargo tauri ios build --ci --debug --target aarch64-sim --no-sign\n/);
  assert.match(workflow, /cargo install tauri-cli --locked --version \d+\.\d+\.\d+\n/, 'the Tauri CLI is pinned');
  assert.doesNotMatch(workflow, /secrets\./, 'no secret reaches a phone build');
  assert.doesNotMatch(workflow, /actions\/cache@/, 'nothing restored from a cache an earlier run could have poisoned');
  for (const name of ['thoughtknot-app-android', 'thoughtknot-app-ios-simulator'])
    assert.match(workflow, new RegExp(`name: ${name}\\n\\s+if-no-files-found: error`), `${name} is kept`);
});

test('the vault key is made on the device and kept in its secure store, and the window may not ask for it yet', () => {
  const keeper = (path) => read(`src-tauri/keeper/${path}`);
  const kotlin = keeper('android/src/main/java/Keeper.kt');
  assert.match(kotlin, /KeyStore\.getInstance\(STORE\)/);
  assert.match(kotlin, /STORE = "AndroidKeyStore"/, 'the sealing key lives in the Android Keystore');
  assert.match(kotlin, /context\.noBackupFilesDir/, 'the sealed copy is never backed up');
  assert.match(kotlin, /SecureRandom\(\)\.nextBytes/, 'made on the device');
  const swift = keeper('ios/Sources/KeeperPlugin.swift');
  assert.match(swift, /kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly/, 'in the Keychain, for this device only');
  assert.match(swift, /SecRandomCopyBytes/, 'made on the device');
  // no key is carried in the app: no run of 16 or more bytes or hex digits is written in the keeper's code
  for (const path of ['src/lib.rs', 'android/src/main/java/Keeper.kt', 'ios/Sources/KeeperPlugin.swift']) {
    assert.doesNotMatch(keeper(path), /(?:0x[0-9a-f]{2}\s*,\s*){16}/i, `${path} holds no key bytes`);
    assert.doesNotMatch(keeper(path), /[0-9a-f]{32}/i, `${path} holds no key written out`);
  }
  assert.match(read('src-tauri/src/lib.rs'), /\.plugin\(tauri_plugin_keeper::init\(\)\)/);
  const capability = JSON.parse(read('src-tauri/capabilities/default.json'));
  assert.ok(!capability.permissions.some((p) => p.startsWith('keeper:')), 'sync allows it when it joins the app (W30)');
  const workflow = readFileSync(new URL('../../../.github/workflows/mobile-app.yml', import.meta.url), 'utf8');
  assert.match(
    workflow,
    /\.\/gradlew --no-daemon :tauri-plugin-keeper:connectedDebugAndroidTest\n/,
    'run on an emulator',
  );
  // the first run made its phone where the emulator did not look, then waited 25 minutes for it to start
  assert.match(workflow, /export ANDROID_AVD_HOME=/, 'avdmanager and the emulator share one folder of phones');
  assert.match(workflow, /emulator" -list-avds \| grep -qx keeper/, 'the phone is found before it is started');
  assert.match(workflow, /timeout \d+ "\$adb" wait-for-device/, 'a phone that never starts fails soon');
});
