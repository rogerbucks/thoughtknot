// The editor server's routes for changes (editor spec §41, github_review_items; TRUST-4, spec_secrets_and_fences).
// GitHub's titles and names reach the pane Claude reads. So the list of items to review never carries a credential.
// A title or author holding one is held back, said in words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changesAnswer } from '../server/editor-changes.ts';

// built here, so no line of this file has the shape of a secret
const value = ['v', 'a', 'l', 'u', 'e'].join('').repeat(2);

const asked = (items) => ({
  sendable: async () => '/vault/Notes/plan.md',
  refusal: () => null,
  held: () => null,
  history: { versions: async () => ({ ok: false, why: 'none' }), textAt: async () => ({ ok: false, why: 'none' }) },
  github: { items: async () => ({ ok: true, value: items }), files: async () => ({ ok: false, why: 'none' }) },
  listed: { versions: new Set(), items: new Map() },
});

test('a review item whose title or author holds a credential is listed with it held back', async () => {
  const items = [
    { kind: 'pull', id: '7', title: `Rotate db_password: "${value}"`, author: 'roger' },
    { kind: 'commit', id: 'a'.repeat(40), title: 'Tidy', author: `db_password: "${value}"` },
    { kind: 'commit', id: 'b'.repeat(40), title: 'Plain', author: 'Ann' },
  ];
  const r = await changesAnswer('/reviews', asked(items));
  assert.equal(r.status, 200);
  assert.ok(!r.text.includes(value), 'no credential reaches the page');
  const listed = JSON.parse(r.text).items;
  assert.equal(listed[0].title, '(held back: it holds a password or secret)');
  assert.equal(listed[0].author, 'roger');
  assert.equal(listed[1].title, 'Tidy');
  assert.equal(listed[1].author, '(held back: it holds a password or secret)');
  assert.deepEqual(listed[2], items[2]);
});
