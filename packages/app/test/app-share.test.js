// Starting a shared vault from the app (editor spec §45, board_access). The Share button opens a panel. One press
// makes the keys here. The panel shows only the public key and a fingerprint, and trusts another device by its key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { DeviceKeys, toHex } from '@thoughtknot/sync';
import { shareButton } from '../src/app-share.ts';
import { until } from '../../obsidian/test/host/load-plugin.js';

/** A window with the Share button over `keeper`; `keeper` keeps what it is handed, as IndexedDB does. */
function share(keeper = memory()) {
  const { window } = new JSDOM('<!doctype html><body><main id="gn-app"></main></body>', {
    url: 'https://app.invalid/',
  });
  const button = shareButton({ doc: window.document, keeper });
  window.document.getElementById('gn-app').append(button);
  return { window, button, keeper, doc: window.document, panel: () => window.document.querySelector('dialog') };
}
const memory = () => {
  const keeper = { kept: null, load: async () => keeper.kept, save: async (k) => void (keeper.kept = k) };
  return keeper;
};
const press = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.Event('click', { bubbles: true }));
const named = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent === text);

test('a window that cannot keep keys says so and offers no way to start', async () => {
  const w = share(null);
  press(w.button);
  await until(() => w.panel());
  await until(() => /cannot keep keys/.test(w.panel().textContent));
  assert.equal(named(w.panel(), 'Start a shared vault'), undefined);
});

test('one press starts a shared vault, and the panel shows this device’s public key and a fingerprint, no more', async () => {
  const t = share();
  press(t.button);
  await until(() => named(t.panel() ?? t.doc, 'Start a shared vault'));
  assert.equal(t.doc.activeElement.textContent, 'Start a shared vault', 'the focus is on the one thing to do');
  press(named(t.panel(), 'Start a shared vault'));
  await until(() => t.panel().querySelector('textarea[readonly]'));
  const key = t.panel().querySelector('textarea[readonly]').value;
  assert.match(key, /^04[0-9a-f]{128}$/);
  assert.match(t.panel().textContent, /Fingerprint to read aloud: [0-9a-f]{4}( [0-9a-f]{4}){3}/);
  assert.match(t.panel().querySelector('[role=status]').textContent, /ready to share/);
  assert.ok(t.keeper.kept, 'the keys are kept');
  assert.ok(!t.panel().innerHTML.includes('PRIVATE'), 'nothing private is on the screen');
  assert.equal(t.panel().querySelectorAll('textarea[readonly]').length, 1);
});

test('another device is trusted by its public key, a wrong one is refused in words, and trust can be taken back', async () => {
  const t = share();
  press(t.button);
  await until(() => named(t.panel(), 'Start a shared vault'));
  press(named(t.panel(), 'Start a shared vault'));
  await until(() => named(t.panel(), 'Trust this device'));
  const field = () => t.panel().querySelectorAll('textarea:not([readonly])')[0];
  const status = () => t.panel().querySelector('[role=status]').textContent;
  field().value = 'not a key';
  press(named(t.panel(), 'Trust this device'));
  await until(() => /not a device’s public key/.test(status()));
  const mine = t.panel().querySelector('textarea[readonly]').value;
  field().value = mine;
  press(named(t.panel(), 'Trust this device'));
  await until(() => /own key/.test(status()));
  const theirs = toHex((await DeviceKeys.create()).publicKey);
  field().value = theirs;
  press(named(t.panel(), 'Trust this device'));
  await until(() => /Now trusted: [0-9a-f]{4}/.test(status()));
  await until(() => t.panel().querySelectorAll('li').length === 1);
  assert.deepEqual(t.keeper.kept.trusted, [theirs]);
  const stop = named(t.panel(), 'Stop trusting');
  assert.match(stop.getAttribute('aria-label'), /^Stop trusting the device [0-9a-f]{4}/);
  press(stop);
  await until(() => t.panel().querySelectorAll('li').length === 0);
  assert.deepEqual(t.keeper.kept.trusted, []);
  assert.match(t.panel().textContent, /No other device is trusted yet/);
});

test('opened again in a later run, the panel shows the same vault, and Done puts the focus back on Share', async () => {
  const keeper = memory();
  const first = share(keeper);
  press(first.button);
  await until(() => named(first.panel(), 'Start a shared vault'));
  press(named(first.panel(), 'Start a shared vault'));
  await until(() => first.panel().querySelector('textarea[readonly]'));
  const key = first.panel().querySelector('textarea[readonly]').value;
  const later = share(keeper);
  press(later.button);
  await until(() => later.panel()?.querySelector('textarea[readonly]'));
  assert.equal(later.panel().querySelector('textarea[readonly]').value, key);
  assert.equal(named(later.panel(), 'Start a shared vault'), undefined, 'a vault is started only once');
  press(named(later.panel(), 'Done'));
  assert.equal(later.panel(), null);
  assert.equal(later.doc.activeElement, later.button);
});
