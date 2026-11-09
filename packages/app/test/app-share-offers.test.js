// What this machine offers for sharing (editor spec ES§40, five_layer_stack). The offers are said in words, nothing is
// switched until the person presses Use on that offer, and the address it replaces is said back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { shareButton } from '../src/app-share.ts';
import { findOnMachine } from '../src/tauri-found.ts';
import { until } from '../../obsidian/test/host/load-plugin.js';

const memory = () => {
  const keeper = { kept: null, load: async () => keeper.kept, save: async (k) => void (keeper.kept = k) };
  return keeper;
};
const press = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.Event('click', { bubbles: true }));
const named = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent === text);
const VPN = { vpns: [{ name: 'the mesh VPN', address: '100.64.0.2' }] };

/** A window with the Share button, its panel open on a started vault, and `find` as what the machine has. */
async function started(find, keeper = memory()) {
  const { window } = new JSDOM('<!doctype html><body></body>', { url: 'https://app.invalid/' });
  const button = shareButton({ doc: window.document, keeper, find });
  window.document.body.append(button);
  press(button);
  const panel = () => window.document.querySelector('dialog');
  await until(
    () => named(panel() ?? window.document, 'Start a shared vault') || panel()?.querySelector('.gn-app-offers'),
  );
  if (named(panel(), 'Start a shared vault')) press(named(panel(), 'Start a shared vault'));
  await until(() => panel().querySelector('.gn-app-offers'));
  return { keeper, panel, status: () => panel().querySelector('[role=status]').textContent };
}

// proves: five_layer_stack
test('an offer is said in words and nothing is switched until it is taken', async () => {
  const d = await started(async () => VPN);
  assert.match(d.panel().querySelector('.gn-app-offers').textContent, /You are on the mesh VPN at 100\.64\.0\.2/);
  assert.equal(d.keeper.kept.link, undefined, 'nothing chosen for the person');
});

// proves: five_layer_stack
test('pressing Use sets the listening address, keeps the other address, and says what it replaced', async () => {
  const d = await started(async () => VPN);
  press(named(d.panel(), 'Use it'));
  await until(() => d.keeper.kept.link?.listen);
  assert.deepEqual(d.keeper.kept.link, { listen: '100.64.0.2:4040' });
  await until(() => /now listens at 100\.64\.0\.2:4040/.test(d.status()));
  assert.ok(named(d.panel(), 'In use').disabled, 'the offer says it is in use');
});

// proves: five_layer_stack
test('the address an offer replaces is said back so it can be written again', async () => {
  const keeper = memory();
  await started(async () => ({}), keeper);
  keeper.kept = { ...keeper.kept, link: { listen: '10.0.0.5:4040', dial: '10.0.0.9:4040' } };
  const d = await started(async () => VPN, keeper);
  press(named(d.panel(), 'Use it'));
  await until(() => d.keeper.kept.link.listen === '100.64.0.2:4040');
  assert.equal(d.keeper.kept.link.dial, '10.0.0.9:4040', 'the other device’s address stays');
  await until(() => /listened at 10\.0\.0\.5:4040 before/.test(d.status()));
});

// proves: five_layer_stack
test('with nothing found, or no way to look, it says so and offers nothing', async () => {
  for (const find of [async () => ({}), async () => Promise.reject(new Error('no')), undefined]) {
    const d = await started(find);
    assert.match(d.panel().querySelector('.gn-app-offers').textContent, /Nothing on this machine to offer yet/);
    assert.equal(named(d.panel(), 'Use it'), undefined);
  }
});

// proves: five_layer_stack
test('the app’s looking command is turned into offers, and a failed look offers nothing', async () => {
  const asked = [];
  const found = await findOnMachine(async (command) => (asked.push(command), [['the mesh VPN', '100.64.0.2']]));
  assert.deepEqual(asked, ['machine_found']);
  assert.deepEqual(found, VPN);
  assert.deepEqual(await findOnMachine(async () => Promise.reject(new Error('no command'))), {});
});
