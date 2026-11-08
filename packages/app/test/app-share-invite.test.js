// Inviting someone and joining, on two devices (editor spec §45, board_access: people join by an encrypted
// invitation). The owner makes an invitation for one trusted device. The guest reads the inviter's fingerprint
// before joining, because nothing else says who sent it. Each device is a window with a keeper of its own.
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

/** A device: a window with the Share button, open on its panel. */
async function device() {
  const keeper = memory();
  const { window } = new JSDOM('<!doctype html><body></body>', { url: 'https://app.invalid/' });
  const button = shareButton({ doc: window.document, keeper });
  window.document.body.append(button);
  press(button);
  const panel = () => window.document.querySelector('dialog');
  await until(() => named(panel() ?? window.document, 'Start a shared vault'));
  return { keeper, panel, status: () => panel().querySelector('[role=status]').textContent };
}
const mineOf = (d) => d.panel().querySelector('textarea[readonly]').value;

/** An owner who started a vault and a guest who joined, with the owner trusting the guest. */
async function owner_and_guest() {
  const owner = await device();
  const guest = await device();
  press(named(owner.panel(), 'Start a shared vault'));
  press(named(guest.panel(), 'Join a shared vault'));
  await until(() => named(owner.panel(), 'Trust this device'));
  await until(() => named(guest.panel(), 'Read the invitation'));
  fill(owner.panel().querySelectorAll('textarea:not([readonly])')[0], mineOf(guest));
  press(named(owner.panel(), 'Trust this device'));
  await until(() => owner.panel().querySelector('select'));
  return { owner, guest };
}
const invitation = async (owner, role = 'edit', board = 'ideas') => {
  const [device, roles] = owner.panel().querySelectorAll('select');
  assert.equal(device.options.length, 1, 'one trusted device to invite');
  roles.value = role;
  fill(owner.panel().querySelector('input[type=text]'), board);
  press(named(owner.panel(), 'Make the invitation'));
  await until(() => owner.panel().querySelectorAll('textarea[readonly]')[1]?.value);
  return owner.panel().querySelectorAll('textarea[readonly]')[1].value;
};

test('with no device trusted yet, the owner is told to trust one first, and there is no way to invite', async () => {
  const owner = await device();
  press(named(owner.panel(), 'Start a shared vault'));
  await until(() => /Trust a device above first/.test(owner.panel().textContent));
  assert.equal(named(owner.panel(), 'Make the invitation'), undefined);
});

test('the guest reads who the invitation is from, and only a press of Join takes it', async () => {
  const { owner, guest } = await owner_and_guest();
  const text = await invitation(owner);
  const ownerPrint = /Fingerprint to read aloud: ([0-9a-f ]{19})/.exec(owner.panel().textContent)[1];
  fill(guest.panel().querySelector('textarea:not([readonly])'), text);
  assert.equal(named(guest.panel(), 'Join with this invitation').hidden, true, 'nothing is joined by pasting');
  press(named(guest.panel(), 'Read the invitation'));
  await until(() => /Invitation from the device/.test(guest.panel().textContent));
  assert.ok(
    guest.panel().textContent.includes(`from the device ${ownerPrint}, to edit ideas.`),
    guest.panel().textContent,
  );
  assert.match(guest.panel().textContent, /Join only if that fingerprint is what the person read out to you/);
  assert.equal(guest.keeper.kept.sealed, null, 'still no vault');
  press(named(guest.panel(), 'Join with this invitation'));
  await until(() => guest.keeper.kept.sealed);
  await until(() => /You joined this vault to edit ideas/.test(guest.panel().textContent));
  assert.match(guest.status(), /You joined the shared vault/);
  assert.equal(named(guest.panel(), 'Make the invitation'), undefined, 'a guest does not invite');
  assert.equal(guest.keeper.kept.joined.as, 'edit');
  assert.deepEqual(guest.keeper.kept.trusted, [mineOf(owner)]);
});

test('a role and a whole-vault invitation are said in words', async () => {
  const { owner, guest } = await owner_and_guest();
  const text = await invitation(owner, 'comment', '');
  fill(guest.panel().querySelector('textarea:not([readonly])'), text);
  press(named(guest.panel(), 'Read the invitation'));
  await until(() => /to comment on every board\./.test(guest.panel().textContent));
});

test('text that is not an invitation, or one made for another device, is refused in words and joins nothing', async () => {
  const { owner, guest } = await owner_and_guest();
  const other = await device();
  press(named(other.panel(), 'Join a shared vault'));
  await until(() => named(other.panel(), 'Read the invitation'));
  fill(guest.panel().querySelector('textarea:not([readonly])'), 'hello');
  press(named(guest.panel(), 'Read the invitation'));
  await until(() => /not an invitation/.test(guest.status()));
  const text = await invitation(owner);
  fill(other.panel().querySelector('textarea:not([readonly])'), text);
  press(named(other.panel(), 'Read the invitation'));
  await until(
    () =>
      named(other.panel(), 'Join with this invitation') && !named(other.panel(), 'Join with this invitation').hidden,
  );
  press(named(other.panel(), 'Join with this invitation'));
  await until(() => /not made for this device/.test(other.status()));
  assert.equal(other.keeper.kept.sealed, null);
});
