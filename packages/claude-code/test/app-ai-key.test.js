// A model's key on a phone (editor spec ES§19, app_ai_key_keychain). The key is written to the device's Keychain only:
// the page hands it to the Keychain port and keeps it nowhere else. Not in the vault, not in the AI setup this device
// keeps, and not in anything that syncs. The field is emptied once it is kept, and the row says only whether one is.
// The app's own side writes it with the Keychain's this-device-only class, so it is not backed up or synced either.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { keyNameOf, keyRow } from '../page/app-ai-key.ts';

const KEY = ['sk', 'phone', 'z'.repeat(24)].join('-');
const settle = () => new Promise((t) => setTimeout(t, 0));

/** A page, a Keychain the test can read, and everything the page could keep a key in besides. */
function device() {
  const win = new JSDOM('<main id="gn-page"></main>', { url: 'https://app.test/' }).window;
  const keychain = new Map();
  const vault = [];
  win.fetch = async (url, init) => {
    vault.push([String(url), init?.body]);
    return new win.Response('{}');
  };
  const keys = {
    has: async (n) => keychain.has(n),
    get: async (n) => keychain.get(n) ?? null,
    set: async (n, k) => void keychain.set(n, k),
    forget: async (n) => void keychain.delete(n),
  };
  return { win, keychain, vault, keys };
}

/** Everything the window keeps: its storage, its cookies and its page. */
const keptInWindow = (win) =>
  [
    ...Object.keys(win.localStorage).map((k) => win.localStorage.getItem(k)),
    ...Object.keys(win.sessionStorage).map((k) => win.sessionStorage.getItem(k)),
    win.document.cookie,
    win.document.documentElement.outerHTML,
  ].join('\n');

describe('a model’s key on a phone', () => {
  test('is written to the Keychain only, under the model’s key name, and the field is emptied', async () => {
    const { win, keychain, vault, keys } = device();
    let told = null;
    const row = keyRow(win.document, keys, 'Mac mini', (n) => (told = n));
    win.document.getElementById('gn-page').append(row);
    const field = row.querySelector('input');
    assert.equal(field.type, 'password');
    field.value = KEY;
    row.querySelectorAll('button')[0].click();
    await settle();
    await settle();
    assert.deepEqual([...keychain], [['Mac mini', KEY]]);
    assert.equal(told, 'Mac mini');
    assert.equal(field.value, '');
    assert.ok(!keptInWindow(win).includes(KEY), 'not in the window’s storage, cookies or page');
    assert.deepEqual(vault, [], 'nothing went to the vault');
    assert.match(row.textContent, /kept for it in this iPhone’s Keychain/);
    assert.ok(!row.textContent.includes(KEY), 'the row never shows the key');
  });

  test('Forget takes it out of the Keychain, and an empty field keeps nothing', async () => {
    const { win, keychain, keys } = device();
    keychain.set('Mac mini', KEY);
    const row = keyRow(win.document, keys, 'Mac mini');
    await settle();
    const [keep, forget] = row.querySelectorAll('button');
    assert.equal(forget.hidden, false);
    forget.click();
    await settle();
    await settle();
    assert.equal(keychain.size, 0);
    assert.match(row.textContent, /No key is kept/);
    keep.click();
    await settle();
    assert.equal(keychain.size, 0);
    assert.match(row.textContent, /Paste the key first/);
  });

  test('a model’s key name is its own, or its name', () => {
    assert.equal(keyNameOf({ name: 'Mac mini', keyName: '' }), 'Mac mini');
    assert.equal(keyNameOf({ name: 'Mac mini', keyName: 'mini key' }), 'mini key');
  });

  test('the page keeps it in no store of its own, and the app writes it to this device’s Keychain only', () => {
    const page = readFileSync(new URL('../page/app-ai-key.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(page, /localStorage|sessionStorage|indexedDB|fetch\(|cookie/);
    const swift = readFileSync(new URL('../../app/src-tauri/ai/ios/Sources/AiKeys.swift', import.meta.url), 'utf8');
    assert.match(swift, /kSecAttrAccessibleWhenUnlockedThisDeviceOnly/, 'never backed up or synced to iCloud');
    assert.doesNotMatch(swift, /kSecAttrSynchronizable\s*:\s*(true|kCFBooleanTrue)/);
  });
});
