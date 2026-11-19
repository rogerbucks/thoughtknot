// Requirement: ios_app (ES§40).
// The iPhone build's preparation (scripts/ios-prepare.mjs): App Store icons with no alpha channel, and a build
// number that only grows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNumber, buildPath, flattenPng, readPng, writeRgbPng } from '../scripts/ios-prepare.mjs';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function rgbaPng(width, height, rgba) {
  // An RGBA PNG (colour type 6) by hand: an IHDR, one IDAT of filter-0 lines, an IEND. readPng skips the CRCs.
  const signature = writeRgbPng(1, 1, Buffer.alloc(3)).subarray(0, 8);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
  };
  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('flattenPng writes an RGB PNG with no alpha channel', () => {
  const png = flattenPng(rgbaPng(2, 1, Buffer.from([255, 255, 255, 255, 0, 0, 0, 0])), [0x4b, 0x32, 0xc3]);
  const { channels, pixels } = readPng(png);
  assert.equal(channels, 3);
  assert.equal(png[25], 2, 'colour type 2 is RGB with no alpha');
  assert.deepEqual([...pixels], [255, 255, 255, 0x4b, 0x32, 0xc3]);
});

test('flattenPng blends a half-transparent pixel onto the background', () => {
  const png = flattenPng(rgbaPng(1, 1, Buffer.from([255, 255, 255, 128])), [0, 0, 0]);
  assert.deepEqual([...readPng(png).pixels], [128, 128, 128]);
});

test('buildNumber is a whole number of commits', () => {
  assert.match(buildNumber(), /^[1-9]\d*$/);
});

test("buildPath puts Apple's /usr/bin, then rustup's Rust, ahead of Homebrew", () => {
  assert.equal(buildPath('/opt/homebrew/bin:/bin', '/r/bin'), '/usr/bin:/r/bin:/opt/homebrew/bin:/bin');
  assert.equal(buildPath(undefined, '/r/bin'), '/usr/bin:/r/bin');
});

test('the privacy manifest gives a reason for each API the built app links', () => {
  const manifest = readFileSync(
    new URL('../packages/app/src-tauri/ios/PrivacyInfo.xcprivacy', import.meta.url),
    'utf8',
  );
  for (const needed of ['FileTimestamp', 'DiskSpace', 'SystemBootTime', 'UserDefaults']) {
    assert.match(manifest, new RegExp(`NSPrivacyAccessedAPICategory${needed}`), needed);
  }
  for (const reason of ['C617.1', '3B52.1', 'E174.1', '35F9.1', 'CA92.1']) assert.ok(manifest.includes(reason), reason);
});
