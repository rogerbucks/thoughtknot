#!/usr/bin/env node
// Builds the iPhone and iPad app for TestFlight and checks what Apple checks on upload.
//
// The Xcode project under packages/app/src-tauri/gen/ is generated and not committed, so what App Store Connect needs
// lives here and in packages/app/src-tauri/ios/, and this script puts it into the project before every build:
// - The icons. The 1024 App Store icon is a full square with no alpha (Apple rejects alpha: ITMS-90717). The other
//   sizes are cut from it. The desktop and website icons are not touched.
// - PrivacyInfo.xcprivacy, Apple's privacy manifest, inside the app.
// - A new build number every build (CFBundleVersion), the UTC time as yyMMddHHmm, so it only goes up. The version
//   people see (0.9.0) stays what the Tauri config says.
//
// Usage: node scripts/ios-build.mjs [--prepare-only]   from the repository root, on a Mac with Xcode and xcodegen.
// Needs: `rustup component add llvm-tools`. The script puts /usr/bin (for Apple's rsync) and rustup's toolchain
// (not Homebrew's Rust, which lacks the iOS targets) first on PATH. The team is APPLE_DEVELOPMENT_TEAM, or Roger's. The signed app comes out as packages/app/src-tauri/gen/apple/build/arm64/*.ipa.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TAURI = join(ROOT, 'packages/app/src-tauri');
const GEN = join(TAURI, 'gen/apple');
const ICONSET = join(GEN, 'Assets.xcassets/AppIcon.appiconset');
const TEAM = '498L23FMB2';

/** The build number for a moment: yyMMddHHmm in UTC, one whole number that goes up with time. */
export function buildNumber(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const y = p(now.getUTCFullYear() % 100);
  return `${y}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}${p(now.getUTCHours())}${p(now.getUTCMinutes())}`;
}

/** The pixel size of each icon file in an appiconset's Contents.json, by file name. */
export function iconSizes(contents) {
  const sizes = {};
  for (const image of contents.images) {
    if (!image.filename) continue;
    sizes[image.filename] = Math.round(parseFloat(image.size) * parseInt(image.scale, 10));
  }
  return sizes;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`);
}

function hasAlpha(file) {
  const out = spawnSync('sips', ['-g', 'hasAlpha', file], { encoding: 'utf8' }).stdout;
  return /hasAlpha: yes/.test(out);
}

/** Cuts every icon in the generated appiconset from the 1024 source, and refuses an icon with alpha. */
export function writeIcons() {
  const source = join(TAURI, 'ios/AppIcon-1024.png');
  if (hasAlpha(source)) throw new Error('ios/AppIcon-1024.png has an alpha channel; Apple rejects it');
  const sizes = iconSizes(JSON.parse(readFileSync(join(ICONSET, 'Contents.json'), 'utf8')));
  for (const [name, px] of Object.entries(sizes)) {
    const out = join(ICONSET, name);
    if (px === 1024) copyFileSync(source, out);
    else run('sips', ['-z', String(px), String(px), source, '--out', out], { stdio: 'ignore' });
    if (hasAlpha(out)) throw new Error(`${name} has an alpha channel`);
  }
}

/** Puts the privacy manifest where the Xcode project takes it into the app, and rebuilds the project. */
export function writePrivacy() {
  copyFileSync(join(TAURI, 'ios/PrivacyInfo.xcprivacy'), join(GEN, 'thoughtknot-app_iOS/PrivacyInfo.xcprivacy'));
  run('xcodegen', ['generate'], { cwd: GEN, stdio: 'ignore' });
}

/** The folder of rustup's cargo and rustc, which have the iOS targets; Homebrew's own Rust does not. */
function rustupBin() {
  const out = spawnSync('rustup', ['which', 'rustc'], { encoding: 'utf8' });
  if (out.status !== 0) throw new Error('rustup is not installed, and it holds the iOS targets');
  return dirname(out.stdout.trim());
}

/** The first .ipa under the build folder, or null. */
function newestIpa() {
  const dir = join(GEN, 'build/arm64');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.ipa')).map((f) => join(dir, f));
  return files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

function main() {
  writeIcons();
  writePrivacy();
  if (process.argv.includes('--prepare-only')) return;
  const number = buildNumber();
  const team = process.env.APPLE_DEVELOPMENT_TEAM || TEAM;
  const env = {
    ...process.env,
    APPLE_DEVELOPMENT_TEAM: team,
    PATH: `/usr/bin:${rustupBin()}:${process.env.PATH}`,
  };
  console.log(`Build number ${number}`);
  const config = JSON.stringify({ bundle: { iOS: { bundleVersion: number } } });
  run('cargo', ['tauri', 'ios', 'build', '--config', config, '--export-method', 'app-store-connect'], { cwd: join(ROOT, 'packages/app'), env });
  console.log(`Signed app: ${newestIpa()}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
