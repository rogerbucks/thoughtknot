// Where the link to the other device runs (editor spec ES§40, mesh_vpn_sync). The person writes the address this device
// listens at and the other device's address. Both are kept with the keys, come back in the next run, and can be cleared.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { shareButton } from '../src/app-share.ts';
import { until } from '../../obsidian/test/host/load-plugin.js';

const memory = () => {
  const keeper = { kept: null, load: async () => keeper.kept, save: async (k) => void (keeper.kept = k) };
  return keeper;
};
const press = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.Event('click', { bubbles: true }));
const named = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent === text);
const fill = (el, value) => Object.assign(el, { value });

/** A window with the Share button over `keeper`, its panel open on a started vault. */
async function started(keeper = memory()) {
  const { window } = new JSDOM('<!doctype html><body></body>', { url: 'https://app.invalid/' });
  const button = shareButton({ doc: window.document, keeper });
  window.document.body.append(button);
  press(button);
  const panel = () => window.document.querySelector('dialog');
  await until(() => named(panel() ?? window.document, 'Start a shared vault') || named(panel(), 'Save the link'));
  if (!named(panel(), 'Save the link')) press(named(panel(), 'Start a shared vault'));
  await until(() => named(panel(), 'Save the link'));
  return { keeper, panel, status: () => panel().querySelector('[role=status]').textContent };
}
const addresses = (d) => [...d.panel().querySelectorAll('input[type=text]')].slice(-2);

// proves: mesh_vpn_sync
test('the two addresses are kept and come back in the next run', async () => {
  const first = await started();
  const [listen, dial] = addresses(first);
  fill(listen, '100.64.0.1:4040');
  fill(dial, '100.64.0.2:4040');
  press(named(first.panel(), 'Save the link'));
  await until(() => /link is saved/.test(first.status()));
  assert.deepEqual(first.keeper.kept.link, { listen: '100.64.0.1:4040', dial: '100.64.0.2:4040' });
  const later = await started(first.keeper);
  assert.deepEqual(
    addresses(later).map((a) => a.value),
    ['100.64.0.1:4040', '100.64.0.2:4040'],
  );
});

// proves: mesh_vpn_sync
test('an empty field clears its address', async () => {
  const d = await started();
  const [listen, dial] = addresses(d);
  fill(listen, '100.64.0.1:4040');
  fill(dial, '100.64.0.2:4040');
  press(named(d.panel(), 'Save the link'));
  await until(() => d.keeper.kept.link?.listen);
  fill(dial, '');
  press(named(d.panel(), 'Save the link'));
  await until(() => d.keeper.kept.link.dial === undefined);
  assert.deepEqual(d.keeper.kept.link, { listen: '100.64.0.1:4040' });
});
