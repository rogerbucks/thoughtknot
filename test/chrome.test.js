// The headless Chrome the checks in a real browser share (scripts/chrome.mjs). Chrome answers its list of pages before
// its first page is open, with an empty list. So the list is asked again until a page is there.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { findChrome, firstPage, INSTALLED, portOf, removeProfile, startAgainIfStuck } from '../scripts/chrome.mjs';

const noWait = async () => {};

describe('the first page of a headless Chrome', () => {
  test('is asked for again while the list is empty or cannot be read, and found once it is there', async () => {
    const answers = [
      () => Promise.reject(new Error('not listening yet')),
      () => [],
      () => [{ type: 'other' }],
      () => [{ type: 'page', id: 'p' }],
    ];
    const page = await firstPage(async () => answers.shift()(), { wait: noWait });
    assert.deepEqual(page, { type: 'page', id: 'p' });
    assert.equal(answers.length, 0);
  });

  test('is said to be missing when no page comes in all the tries', async () => {
    await assert.rejects(
      firstPage(async () => [], { tries: 3, wait: noWait }),
      /Chrome opened no page/,
    );
  });
});

describe('the profile of a headless Chrome, removed when it stops', () => {
  const failing = (code) => () => {
    throw Object.assign(new Error(code), { code });
  };

  test('is left for the system when it is still busy, and any other error is thrown', () => {
    assert.doesNotThrow(() => removeProfile('/tmp/profile', failing('ENOTEMPTY')));
    assert.doesNotThrow(() => removeProfile('/tmp/profile', failing('EBUSY')));
    assert.throws(() => removeProfile('/tmp/profile', failing('EACCES')), { code: 'EACCES' });
  });
});

describe("Chrome's DevTools port", () => {
  const noWait = () => Promise.resolve();
  test('is read from the file Chrome writes, once it is there, so two Chromes never share one', async () => {
    let reads = 0;
    const read = () => {
      reads++;
      if (reads < 3) throw new Error('ENOENT');
      return '41234\n/devtools/browser/abc\n';
    };
    assert.equal(await portOf('/profile', { read, wait: noWait }), 41234);
    assert.equal(reads, 3);
  });
  test('says so when Chrome never writes it', async () => {
    await assert.rejects(portOf('/profile', { read: () => '', wait: noWait, tries: 3 }), /no DevTools port/);
  });
});

describe('a Chrome that does not come up', () => {
  const stuck = (message) => () => Promise.reject(new Error(message));

  test('is started once more, fresh, when it opened no DevTools port or no page', async () => {
    for (const message of ['Chrome opened no DevTools port', 'Chrome opened no page']) {
      const tries = [stuck(message), async () => 'chrome'];
      assert.equal(await startAgainIfStuck(() => tries.shift()()), 'chrome');
      assert.equal(tries.length, 0);
    }
  });

  test('gives up after its tries, with the last reason', async () => {
    let starts = 0;
    const start = () => (starts++, Promise.reject(new Error('Chrome opened no page')));
    await assert.rejects(startAgainIfStuck(start, 2), /Chrome opened no page/);
    assert.equal(starts, 2);
  });

  test('is not started again for any other error', async () => {
    let starts = 0;
    const start = () => (starts++, Promise.reject(new Error('no Chrome found')));
    await assert.rejects(startAgainIfStuck(start), /no Chrome found/);
    assert.equal(starts, 1);
  });
});

describe('the Chrome to run', () => {
  const none = () => {
    throw new Error('which: not found');
  };

  test('is found where a Mac or a Windows PC installs it, as neither puts it on the PATH', () => {
    for (const platform of ['darwin', 'win32']) {
      const [first, second] = INSTALLED[platform];
      assert.equal(findChrome(undefined, none, { platform, exists: (p) => p === second }), second, platform);
      assert.equal(findChrome(undefined, none, { platform, exists: () => true }), first, platform);
    }
  });

  test('is the one given, then the one on the PATH, before an installed one', () => {
    const all = { platform: 'darwin', exists: () => true };
    assert.equal(findChrome('/my/chrome', none, all), '/my/chrome');
    assert.equal(
      findChrome(undefined, (n) => (n === 'chromium' ? '/usr/bin/chromium' : ''), all),
      '/usr/bin/chromium',
    );
  });

  test('is said to be missing when none is on the PATH or installed', () => {
    assert.throws(() => findChrome(undefined, none, { platform: 'linux', exists: () => true }), /no Chrome found/);
    assert.throws(() => findChrome(undefined, none, { platform: 'win32', exists: () => false }), /no Chrome found/);
  });
});
