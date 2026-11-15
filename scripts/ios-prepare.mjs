#!/usr/bin/env node
// Gets the generated iPhone project ready for an App Store or TestFlight build. `packages/app/src-tauri/gen/` is made
// by `cargo tauri ios init` and is not committed, so these steps run again before every build:
//
// 1. App icons. Apple rejects an App Store icon that has an alpha channel (ITMS-90717), and iOS rounds the corners
//    itself. So the iPhone icons are drawn from the site's icon as a full square: `cargo tauri icon` makes every size,
//    and each one is flattened onto the icon's purple and written back with no alpha channel. Desktop and website
//    icons are left as they are.
// 2. Privacy manifest. `packages/app/src-tauri/ios/PrivacyInfo.xcprivacy` is copied into the app's folder, which
//    project.yml already bundles.
// 3. Build number. Every upload needs a higher CFBundleVersion than the last, so the build number is the count of
//    commits on the checked-out branch: it only grows along main. It goes to Tauri as `bundle.iOS.bundleVersion`.
//
// Usage:
//   node scripts/ios-prepare.mjs             do steps 1 and 2, and print the build number.
//   node scripts/ios-prepare.mjs --build     also run `cargo tauri ios build` for app-store-connect with that number.
//   add --root DIR                           to work on another checkout of the repo, such as the main one from a
//                                            worktree, since only the checkout that ran `ios init` has gen/.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const HERE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The purple behind the site's icon, as [r, g, b]. */
export const ICON_BACKGROUND = [0x4b, 0x32, 0xc3];

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}

/** Reads an 8-bit, non-interlaced PNG into its width, height, channel count and unfiltered pixel bytes. */
export function readPng(file) {
  if (!file.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG file');
  let offset = 8;
  let header;
  const data = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('latin1', offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') header = body;
    if (type === 'IDAT') data.push(body);
    offset += 12 + length;
  }
  if (!header) throw new Error('PNG has no IHDR chunk');
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const [depth, colour, , , interlace] = header.subarray(8, 13);
  const channels = CHANNELS[colour];
  if (depth !== 8 || !channels || interlace !== 0) {
    throw new Error(`unsupported PNG: depth ${depth}, colour type ${colour}, interlace ${interlace}`);
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      const predictor = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter];
      if (predictor === undefined) throw new Error(`unknown PNG filter ${filter}`);
      pixels[y * stride + x] = (line[x] + predictor) & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

/** Writes 8-bit RGB pixels as a PNG with no alpha channel. */
export function writeRgbPng(width, height, rgb) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Flattens a PNG onto a solid background and returns it as an RGB PNG with no alpha channel. */
export function flattenPng(file, background = ICON_BACKGROUND) {
  const { width, height, channels, pixels } = readPng(file);
  const rgb = Buffer.alloc(width * height * 3);
  for (let index = 0; index < width * height; index += 1) {
    const pixel = pixels.subarray(index * channels, (index + 1) * channels);
    const colour = channels >= 3 ? [pixel[0], pixel[1], pixel[2]] : [pixel[0], pixel[0], pixel[0]];
    const alpha = channels === 4 ? pixel[3] : channels === 2 ? pixel[1] : 255;
    for (let part = 0; part < 3; part += 1) {
      rgb[index * 3 + part] = Math.round((colour[part] * alpha + background[part] * (255 - alpha)) / 255);
    }
  }
  return writeRgbPng(width, height, rgb);
}

/** The build number for this checkout: the number of commits on HEAD, as a string. */
export function buildNumber(cwd = HERE) {
  return execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
}

// The icon and privacy manifest come from this script's own checkout; the project they go into, from --root's.
function paths(root) {
  return {
    apple: join(root, 'packages', 'app', 'src-tauri', 'gen', 'apple'),
    iconSource: join(HERE, 'site', 'icon.svg'),
    privacy: join(HERE, 'packages', 'app', 'src-tauri', 'ios', 'PrivacyInfo.xcprivacy'),
  };
}

function prepareIcons(apple, iconSource) {
  const appIcons = join(apple, 'Assets.xcassets', 'AppIcon.appiconset');
  const out = mkdtempSync(join(tmpdir(), 'ios-icons-'));
  try {
    execFileSync('cargo', ['tauri', 'icon', iconSource, '-o', out, '--ios-color', '#4b32c3'], { stdio: 'ignore' });
    const made = readdirSync(join(out, 'ios')).filter((name) => name.endsWith('.png'));
    for (const name of made) writeFileSync(join(appIcons, name), flattenPng(readFileSync(join(out, 'ios', name))));
    return made.length;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

function main(args) {
  const rootAt = args.indexOf('--root');
  const root = rootAt === -1 ? HERE : args[rootAt + 1];
  const { apple, iconSource, privacy } = paths(root);
  if (!existsSync(apple)) throw new Error(`no iPhone project at ${apple}: run \`cargo tauri ios init\` first`);
  const icons = prepareIcons(apple, iconSource);
  copyFileSync(privacy, join(apple, 'thoughtknot-app_iOS', 'PrivacyInfo.xcprivacy'));
  const build = buildNumber(root);
  console.log(`ios-prepare: ${icons} icons with no alpha, privacy manifest copied, build number ${build}`);
  if (args.includes('--build')) {
    const config = JSON.stringify({ bundle: { iOS: { bundleVersion: build } } });
    execFileSync('cargo', ['tauri', 'ios', 'build', '--export-method', 'app-store-connect', '--config', config], {
      cwd: join(root, 'packages', 'app'),
      stdio: 'inherit',
    });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
