// AI on the phone app's page (editor spec ES§19, app_ai_host; ai_private_is_own). The app hands the page its ports, and
// the core keeps every rule, as it does for Obsidian:
// - with AI off, nothing is sent;
// - a note above a model's ceiling is refused, with the reason;
// - a send is shown before it goes, goes only on a yes to exactly it, is recorded, and is answered as a proposal;
// - a model the person runs may be reached by a Tailscale name, and counts as their own.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { confirmSend, privateProblem } from '@thoughtknot/core';
import { NOTE, OWN, phone } from './app-ai-fakes.js';

const ASK = {
  model: OWN.name,
  note: NOTE,
  notePath: 'Trip.md',
  choice: { graph: 'trip', what: 'graph' },
  question: 'What is near?',
};

describe('AI on the phone app’s page', () => {
  test('with AI off, nothing is sent, and the page says why', async () => {
    const { ai, device, ports } = await phone({ setup: { aiUse: 'off', aiModels: [OWN], aiUnlabelled: 'Public' } });
    const p = await ai.prepare(ASK);
    assert.match(p.refused, /AI is off/);
    assert.equal(device.sent.length, 0);
    assert.deepEqual(ports.record.list(), []);
  });

  test('a note above the model’s ceiling is refused with the reason, and nothing goes', async () => {
    // a note with no classification counts as the level the person set: here above the model's ceiling
    const { ai, device } = await phone({ setup: { aiUse: 'on', aiModels: [OWN], aiUnlabelled: 'Internal' } });
    const p = await ai.prepare(ASK);
    assert.ok('refused' in p, JSON.stringify(p));
    assert.match(p.refused, /Internal/);
    assert.match(p.refused, /Public/);
    assert.equal(device.sent.length, 0);
  });

  test('a send is shown first, goes only on a yes to exactly it, is recorded, and is answered as a proposal', async () => {
    const { ai, device, ports } = await phone({ setup: { aiUse: 'on', aiModels: [OWN], aiUnlabelled: 'Public' } });
    device.keychain.set(OWN.keyName, 'kept-in-the-keychain');
    const p = await ai.prepare(ASK);
    assert.ok(!('refused' in p), JSON.stringify(p));
    assert.equal(p.to, 'https://mac-mini.tailnet.ts.net/v1/chat/completions');
    assert.match(p.body, /Paris/);
    // no yes, or a yes to another request, sends nothing
    assert.ok('refused' in (await ai.send(p, undefined)));
    assert.ok('refused' in (await ai.send(p, confirmSend({ ...p, body: `${p.body} ` }))));
    assert.equal(device.sent.length, 0);
    const result = await ai.send(p, confirmSend(p));
    assert.equal(device.sent.length, 1);
    assert.equal(device.sent[0].body, p.body, 'exactly what was shown');
    assert.equal(device.sent[0].url, p.to);
    assert.equal(device.sent[0].headers.Authorization, `Bearer {{keychain:${OWN.keyName}}}`, 'the key named, not read');
    assert.ok(!JSON.stringify(device.sent).includes('kept-in-the-keychain'), 'the page never had the key');
    assert.ok('proposal' in result, JSON.stringify(result));
    const records = ports.record.list();
    assert.equal(records.length, 1);
    assert.equal(records[0].outcome, 'answered');
    assert.equal(records[0].to, p.to);
    assert.ok(!JSON.stringify(records).includes('Paris'), 'the record holds no text sent');
  });

  test('a model the person runs is reached by its Tailscale name, as their own; a cloud model is not yet', async () => {
    assert.equal(privateProblem(OWN.endpoint), null);
    assert.equal(privateProblem('https://100.101.102.103/v1'), null);
    assert.ok(privateProblem('https://api.example.com/v1'));
    const cloud = { ...OWN, name: 'Cloud', endpoint: 'https://api.example.com/v1', reach: undefined };
    const { ai, device } = await phone({ setup: { aiUse: 'on', aiModels: [cloud], aiUnlabelled: 'Public' } });
    const p = await ai.prepare({ ...ASK, model: 'Cloud' });
    assert.ok('refused' in p, 'a public model gets nothing while this vault allows none');
    assert.equal(device.sent.length, 0);
  });
});
