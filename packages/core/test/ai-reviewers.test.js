// The private and public reviewers (editor spec §19). The rules: ai_two_reviewers, ai_private_is_own,
// ai_private_default, ai_private_gets_note and ai_public_names_only. A note goes to a model the user runs, with its text. A cloud model is
// asked only when the vault allows it, and gets names and links only until the vault allows more.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { aiModel } from '../src/ai-model.ts';
import { NO_CONSENT, isPrivate, privateProblem, reviewerFor } from '../src/ai-reviewers.ts';

const model = (name, endpoint, reach) =>
  aiModel({ name, purpose: 'Proposing changes', endpoint, model: 'm', ...(reach && { reach }) });
const LM = model('LM Studio', 'https://lmstudio.taila0fac4.ts.net/v1', 'private');
const CLOUD = model('Cloud', 'https://api.example.com/v1');

describe('each model is a private or a public reviewer (ai_two_reviewers)', () => {
  test('public by default; private only when marked, and kept when read back', () => {
    assert.equal(CLOUD.reach, undefined);
    assert.equal(LM.reach, 'private');
    assert.equal(aiModel({ ...LM }).reach, 'private');
    assert.equal(aiModel({ ...CLOUD, reach: 'anything' }).reach, undefined);
    assert.ok(!isPrivate(CLOUD));
    assert.ok(isPrivate(LM));
  });
});

describe('only a model the user runs may be private (ai_private_is_own)', () => {
  test('this device, a private network address or the user’s own network name', () => {
    for (const e of [
      'http://localhost:1234/v1',
      'http://127.0.0.1:1234/v1',
      'https://10.0.0.5/v1',
      'https://192.168.1.20:1234/v1',
      'https://172.20.0.2/v1',
      'https://100.101.102.103/v1',
      'https://lmstudio.taila0fac4.ts.net/v1',
      'https://studio.local/v1',
    ])
      assert.equal(privateProblem(e), null, e);
  });

  test('any other address is refused as private, saying why; so is one sent unencrypted off the device', () => {
    assert.match(privateProblem('https://api.example.com/v1'), /api\.example\.com is not on this device or your own/);
    assert.match(privateProblem('https://172.32.0.1/v1'), /not on this device/);
    assert.match(privateProblem('https://100.128.0.1/v1'), /not on this device/);
    assert.match(privateProblem('http://192.168.1.20/v1'), /https/);
    const fake = model('Fake', 'https://api.example.com/v1', 'private');
    assert.ok(!isPrivate(fake));
  });
});

describe('a note goes to the private reviewer, with its text (ai_private_default, ai_private_gets_note)', () => {
  test('the private reviewer wins, gets the note and is not asked each time', () => {
    assert.deepEqual(reviewerFor([CLOUD, LM], { publicAllowed: true, noteTextAllowed: true }), {
      model: LM,
      reach: 'private',
      sends: 'note',
      confirm: false,
    });
  });

  test('with no private reviewer and no consent, nothing is sent and the editor says why', () => {
    const r = reviewerFor([CLOUD], NO_CONSENT);
    assert.match(r.none, /No private reviewer is set up/);
    assert.match(reviewerFor([], NO_CONSENT).none, /No private reviewer/);
  });
});

describe('a public reviewer gets names and links only, until the vault allows more (ai_public_names_only)', () => {
  test('allowed for the vault: names only, each send confirmed first', () => {
    assert.deepEqual(reviewerFor([CLOUD], { publicAllowed: true, noteTextAllowed: false }), {
      model: CLOUD,
      reach: 'public',
      sends: 'names',
      confirm: true,
    });
  });

  test('note text only once the vault allows it, and withdrawing it stops it at once', () => {
    const allowed = { publicAllowed: true, noteTextAllowed: true };
    assert.equal(reviewerFor([CLOUD], allowed).sends, 'note');
    assert.equal(reviewerFor([CLOUD], { ...allowed, noteTextAllowed: false }).sends, 'names');
  });
});
