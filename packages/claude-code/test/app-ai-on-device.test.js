// The phone's own model (editor spec ES§19, app_ai_on_device). Where the phone offers a model on the device, it is listed
// first and marked private, and a note sent to it goes to the device, never the network, under every rule of a send.
// Where the phone offers none, nothing changes: the models set up are offered as before.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { confirmSend } from '@thoughtknot/core';
import { aiSection } from '../page/app-ai-settings.ts';
import { ANSWER, NOTE, OWN, phone } from './app-ai-fakes.js';

const SETUP = { aiUse: 'on', aiModels: [OWN], aiUnlabelled: 'Public' };
const ASK = { note: NOTE, notePath: 'Trip.md', choice: { graph: 'trip', what: 'graph' }, question: 'What is near?' };
const content = JSON.parse(ANSWER).choices[0].message.content;

describe('the phone’s own model', () => {
  test('where the phone offers one, it is listed first and marked private', async () => {
    const { ai, win } = await phone({ setup: SETUP, own: content });
    assert.deepEqual(
      ai.choices('Research questions').map((c) => [c.name, c.source]),
      [
        ['This iPhone', 'host'],
        ['Mac mini', 'settings'],
      ],
    );
    const section = aiSection(win.document, ai);
    const first = section.querySelector('fieldset');
    assert.ok(first.classList.contains('gn-ai-on-device'), 'first in the More view too');
    assert.match(first.textContent, /This iPhone/);
    assert.match(first.textContent, /Private/);
    assert.match(first.textContent, /never leaves the phone/);
  });

  test('a note sent to it goes to the device, not the network, and is recorded', async () => {
    const { ai, device, ports } = await phone({ setup: SETUP, own: content });
    const p = await ai.prepare({ ...ASK, model: 'This iPhone' });
    assert.ok(!('refused' in p), JSON.stringify(p));
    assert.equal(p.to, 'this iPhone itself');
    const result = await ai.send(p, confirmSend(p));
    assert.equal(device.sent.length, 0, 'nothing on the network');
    assert.equal(device.asked.length, 1);
    assert.match(device.asked[0].prompt, /Paris/);
    assert.ok('proposal' in result, JSON.stringify(result));
    assert.equal(ports.record.list()[0].model, 'This iPhone');
  });

  test('it keeps a ceiling: below the highest until changed, and a note above it is refused', async () => {
    const { ai, win } = await phone({ setup: { ...SETUP, aiUnlabelled: 'Restricted' }, own: content });
    assert.equal(ai.onDevice.model.ceiling, 'Confidential');
    assert.ok('refused' in (await ai.prepare({ ...ASK, model: 'This iPhone' })));
    const section = aiSection(win.document, ai);
    const ceiling = section.querySelector('.gn-ai-on-device select');
    ceiling.value = 'Restricted';
    ceiling.dispatchEvent(new win.Event('change'));
    assert.equal(ai.onDevice.model.ceiling, 'Restricted');
  });

  test('where the phone offers none, nothing changes', async () => {
    const { ai, win } = await phone({ setup: SETUP });
    assert.equal(ai.onDevice, null);
    assert.deepEqual(
      ai.choices('Research questions').map((c) => c.name),
      ['Mac mini'],
    );
    assert.equal(aiSection(win.document, ai).querySelector('.gn-ai-on-device'), null);
    assert.match((await ai.prepare({ ...ASK, model: 'This iPhone' })).refused, /./);
  });
});
