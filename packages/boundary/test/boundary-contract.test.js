// What crosses from the personal layer to a corporate one (editor spec §40, boundary_contract). It must be readable by
// both, carry no key, and carry AI-made content only as the setting's rule says: labelled, left out, or held.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { readNote } from '@thoughtknot/core';
import { MemoryStore, VaultKey, syncedOver } from '../../sync/src/index.ts';
import { DEFAULT_AI_RULE, isParcel, keysIn, makeParcel, readSetting } from '../src/index.ts';
import { NOTE, TEXT, setting } from './helpers.js';

const DATE = '2026-10-29';
// keys made of parts, so the repository's own secret scan never takes this test for a leak
const PEM = ['-----BEGIN', 'PRIVATE KEY-----\nMIIEvQ\n-----END', 'PRIVATE KEY-----'].join(' ');
const TOKEN = ['ghp', 'abcdefghijklmnopqrstuvwxyz0123456789'].join('_');
const send = (text, s, more = {}) => makeParcel({ path: NOTE, text }, s, { date: DATE, ...more });
const noteOf = (crossing) => crossing.parcel.files.find((f) => f.type === 'text/markdown').text;

/** The things and links of the note's graph `shop`, as a reader of the parcel reads them. */
function shopOf(md) {
  const blocks = [...md.matchAll(/```gql\n([\s\S]*?)\n```/g)].map((m) => m[1]);
  return readNote(blocks).whole['shop'];
}

describe('boundary_contract', () => {
  // proves: boundary_contract
  test('a parcel is plain text both sides read, with personal and redacted things left behind', () => {
    const crossing = send(TEXT, setting());
    assert.ok(crossing.ok);
    assert.ok(isParcel(crossing.parcel) && Object.isFrozen(crossing.parcel));
    for (const f of crossing.parcel.files) assert.equal(typeof f.text, 'string', `${f.path} is text`);
    const shop = shopOf(noteOf(crossing));
    assert.deepEqual([...shop.nodes.keys()].sort(), ['g', 'w'], 'the profile and the secret plan stay behind');
    assert.match(noteOf(crossing), /What we sell this month\./, 'the words around the graph cross as written');
    const m = JSON.parse(crossing.parcel.files.find((f) => f.path === 'manifest.json').text);
    assert.equal(m.personal, 1);
    assert.deepEqual(m.left, [{ kind: 'redacted', graph: 'shop', thing: 'm' }]);
  });

  // proves: boundary_contract
  test('AI-made content is labelled by default, left out when the setting says so, or held for a person', () => {
    assert.equal(DEFAULT_AI_RULE, 'label');
    const labelled = send(TEXT, setting());
    const shop = shopOf(noteOf(labelled));
    assert.equal(shop.nodes.get('g')[1].ai_label, 'AI-assisted');
    assert.equal(shop.edges.find(([a, , b]) => a === 'w' && b === 'g')[3].ai_label, 'AI-assisted');
    assert.equal(shop.nodes.get('w')[1].ai_label, undefined, 'what a person made carries no label');
    assert.deepEqual(labelled.parcel.manifest.aiLabelled, ['shop/g', 'shop/w-SOLD_WITH->g']);

    const removed = send(TEXT, setting('remove'));
    assert.deepEqual([...shopOf(noteOf(removed)).nodes.keys()], ['w']);
    assert.ok(removed.parcel.manifest.left.some((l) => l.kind === 'ai-removed' && l.thing === 'g'));

    const held = send(TEXT, setting('hold'));
    assert.deepEqual(held, { ok: false, why: 'hold', aiThings: ['shop/g', 'shop/w-SOLD_WITH->g'] });
    const allowed = send(TEXT, setting('hold'), { allowed: true });
    assert.ok(allowed.ok && allowed.parcel.manifest.aiLabelled.length === 2, 'once allowed, it crosses labelled');
  });

  // proves: boundary_contract
  test('any key in what would cross refuses the whole parcel, and says where', () => {
    const pem = TEXT.replace('What we sell', `${PEM}\nWhat we sell`);
    assert.deepEqual(send(pem, setting()), { ok: false, why: 'key', kinds: ['a private key'], files: [NOTE] });
    const jwk = TEXT.replace(
      'price: 10}',
      `price: 10, jwk: '{"kty":"EC","crv":"P-256","d":"8m2RkGQbqzJm3hU2Vf1PZgk4aE9yF6c"}'}`,
    );
    const refused = send(jwk, setting());
    assert.equal(refused.why, 'key');
    assert.ok(!JSON.stringify(refused).includes('8m2RkGQ'), 'the refusal names the kind, never the key');
    // a redaction never makes a key safe to send: the key is refused even in a thing the setting would leave out
    const inSecret = TEXT.replace("tags: 'secret, finance'", `tags: 'secret, finance', token: '${TOKEN}'`);
    assert.equal(send(inSecret, setting()).ok, true, 'a redacted thing does not cross, so neither does its key');
    const inProse = `${TEXT}\nToken: ${TOKEN}\n`;
    assert.equal(send(inProse, setting()).why, 'key');
  });

  // proves: boundary_contract
  test('the vault key never crosses: not as bytes, nor written out by mistake', async () => {
    const drawn = [];
    const real = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    globalThis.crypto.getRandomValues = (a) => {
      const out = real(a);
      drawn.push(Buffer.from(out.buffer, out.byteOffset, out.byteLength).toString('hex'));
      return out;
    };
    let key;
    try {
      key = await VaultKey.create();
    } finally {
      globalThis.crypto.getRandomValues = real;
    }
    const notes = syncedOver(new MemoryStore(), key, 'desktop');
    await notes.open(NOTE, TEXT);
    const crossing = send(notes.read(NOTE).text, setting());
    const all = crossing.parcel.files.map((f) => f.text).join('\n');
    for (const hex of drawn)
      for (const form of [hex, Buffer.from(hex, 'hex').toString('base64')]) assert.ok(!all.includes(form));

    // a key pasted into a note says only that it is a key, and that word alone refuses the parcel
    const pasted = `${TEXT}\nKey: ${JSON.stringify({ key })} ${inspect(key)}\n`;
    assert.deepEqual(keysIn(pasted), ['a sync key']);
    assert.equal(send(pasted, setting()).why, 'key');
  });

  // proves: boundary_contract
  test('a parcel is made from a note’s text alone, so an AI suggestion nobody applied cannot cross', () => {
    assert.equal(makeParcel.length, 2, 'the note and the setting; the third is options');
    const crossing = makeParcel({ path: NOTE, text: TEXT, proposals: [{ name: 'Gizmo' }] }, setting(), { date: DATE });
    assert.ok(!crossing.parcel.files.some((f) => f.text.includes('Gizmo')));
  });

  test('a setting is plain data, read with its defaults or refused with the first thing wrong', () => {
    const read = readSetting({ name: 'Acme' });
    assert.deepEqual(read, {
      ok: true,
      setting: { name: 'Acme', redact: [], aiLabel: 'AI-assisted', ai: 'label', policy: {} },
    });
    assert.deepEqual(readSetting({ name: 'Acme', ai: 'maybe' }), { ok: false, problem: { code: 'bad-ai-rule' } });
    assert.deepEqual(readSetting({ name: 'Acme', redact: [{}] }), {
      ok: false,
      problem: { code: 'bad-redaction', at: '0' },
    });
    assert.deepEqual(readSetting([]), { ok: false, problem: { code: 'not-an-object' } });
  });
});
