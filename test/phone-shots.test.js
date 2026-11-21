// The phone's screens pictured in WebKit, the engine an iPhone draws every page with (editor spec ES§40,
// phone_webkit_shots). The workflow pictures them on macOS, at each iPhone size, as a download of the run.
// - Off pull requests, as the iPhone build is: macOS minutes are dear (Roger, 7 Nov 2026).
// - On macOS: on Ubuntu, WebKit needs packages from apt that the licence rules do not allow (Roger, 21 Nov 2026).
// - Where WebKit is installed, the pictures are taken here too: each shows the phone shell, at twice its size in points.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ENGINES, PHONES, shoot } from '../scripts/phone-shots.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const job = (name) =>
  new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [\\w-]+:\\n|$)`).exec(
    read('.github/workflows/mobile-app.yml'),
  )?.[1] ?? '';

/** A PNG's width and height in pixels, read from its header. */
const size = (file) => {
  const png = readFileSync(file);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};

/** Whether this machine has the WebKit the pinned Playwright asks for. */
const webkitHere = async () => {
  try {
    const { webkit } = await import('playwright-core');
    return existsSync(webkit.executablePath());
  } catch {
    return false;
  }
};

test('the pictures are of an iPhone 15, 393 by 852, among the sizes, and WebKit can take them', () => {
  assert.deepEqual(
    PHONES.find(([name]) => name === '15'),
    ['15', 393, 852],
  );
  assert.ok(ENGINES.includes('webkit'));
});

test('the phone workflow pictures the screens in WebKit on macOS, off pull requests, as a download', () => {
  const shots = job('webkit-shots');
  assert.ok(shots, 'mobile-app.yml has a webkit-shots job');
  assert.match(shots, /runs-on: macos-/);
  assert.equal(
    /^    if: (.*)$/m.exec(shots)?.[1],
    /^    if: (.*)$/m.exec(job('ios-simulator'))?.[1],
    'gated as the iPhone build',
  );
  assert.match(shots, /run: npx playwright-core install webkit$/m);
  assert.doesNotMatch(shots, /--with-deps|install-deps|apt/, 'nothing from apt, out of sight or not');
  assert.match(shots, /run: node scripts\/phone-shots\.mjs \S+ --webkit$/m);
  assert.match(shots, /uses: actions\/upload-artifact@[0-9a-f]{40} # v/);
  assert.match(shots, /if-no-files-found: error/);
});

test('a browser it cannot drive is refused by name, before anything is built', async () => {
  await assert.rejects(shoot(join(tmpdir(), 'phone-shots-none'), { engine: 'safari' }), /no such browser: safari/);
});

test('in WebKit, each picture is the phone shell, at twice its size in points', async (t) => {
  if (!(await webkitHere())) return t.skip('WebKit is not installed here: npx playwright-core install webkit');
  const out = mkdtempSync(join(tmpdir(), 'phone-shots-webkit-'));
  try {
    const files = await shoot(out, { engine: 'webkit' });
    assert.equal(files.length, PHONES.length * 5, 'a start page and four views for each phone');
    assert.equal(readdirSync(out).length, files.length);
    for (const [name, width, height] of PHONES)
      for (const file of files.filter((f) => f.includes(`/${name}-`)))
        assert.deepEqual(size(file), [width * 2, height * 2], file);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
