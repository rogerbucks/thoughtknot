// The iPhone build script (scripts/ios-build.mjs) puts what App Store Connect checks into the generated Xcode project.
// These tests hold what a machine can check without Xcode: the build number goes up with time, the icon sizes come
// out right, the App Store icon in the repo has no alpha, and the privacy manifest says what the app does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { buildNumber, iconSizes } from '../scripts/ios-build.mjs';

test('the build number is the UTC time and only goes up', () => {
  assert.equal(buildNumber(new Date('2026-11-15T09:05:00Z')), '2611150905');
  assert.ok(Number(buildNumber(new Date('2026-11-15T09:06:00Z'))) > Number(buildNumber(new Date('2026-11-15T09:05:00Z'))));
  assert.ok(Number(buildNumber(new Date('2027-01-01T00:00:00Z'))) > Number(buildNumber(new Date('2026-12-31T23:59:00Z'))));
});

test('icon sizes are the point size times the scale', () => {
  const sizes = iconSizes({
    images: [
      { size: '20x20', scale: '3x', filename: 'a.png' },
      { size: '83.5x83.5', scale: '2x', filename: 'b.png' },
      { size: '1024x1024', scale: '1x', filename: 'c.png' },
      { size: '60x60', scale: '2x' },
    ],
  });
  assert.deepEqual(sizes, { 'a.png': 60, 'b.png': 167, 'c.png': 1024 });
});

test('the App Store icon is 1024 square with no alpha', { skip: process.platform !== 'darwin' }, () => {
  const out = execFileSync('sips', ['-g', 'hasAlpha', '-g', 'pixelWidth', '-g', 'pixelHeight', 'packages/app/src-tauri/ios/AppIcon-1024.png'], { encoding: 'utf8' });
  assert.match(out, /hasAlpha: no/);
  assert.match(out, /pixelWidth: 1024/);
  assert.match(out, /pixelHeight: 1024/);
});

test('the privacy manifest tracks nobody, collects nothing and names a reason for each system call', () => {
  const text = readFileSync('packages/app/src-tauri/ios/PrivacyInfo.xcprivacy', 'utf8');
  assert.match(text, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  assert.match(text, /<key>NSPrivacyCollectedDataTypes<\/key>\s*<array\/>/);
  for (const reason of ['C617.1', '3B52.1', 'E174.1', 'CA92.1']) assert.ok(text.includes(reason), reason);
});
