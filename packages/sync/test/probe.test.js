// What a machine offers for each swappable part (editor spec ES§40, five_layer_stack). Offers are said in words, nothing is
// chosen for the person, and the place in use now is never removed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accepted, offers } from '../src/index.ts';

const found = {
  keychain: 'macOS Keychain',
  syncedFolders: [{ name: 'iCloud Drive', path: '/Users/r/iCloud/ThoughtKnot' }],
  vpns: [{ name: 'Tailscale', address: '100.64.0.2:4040' }],
};

// proves: five_layer_stack
test('each thing found is offered for its part, in words', () => {
  const all = offers(found);
  assert.deepEqual(all.map((o) => o.part).sort(), ['keeper', 'syncstore', 'transport']);
  for (const o of all) assert.match(o.says, /^[A-Z].*\.$/, 'a sentence');
  assert.equal(new Set(all.map((o) => o.id)).size, all.length, 'each offer has its own id');
});

// proves: five_layer_stack
test('nothing found, nothing offered', () => {
  assert.deepEqual(offers({}), []);
});

// proves: five_layer_stack
test('nothing is taken for the person: only what was accepted comes back', () => {
  const all = offers(found);
  assert.deepEqual(accepted(all, new Set()), [], 'no choice, no swap');
  const pick = all.find((o) => o.part === 'transport');
  assert.deepEqual(accepted(all, new Set([pick.id])), [pick]);
  assert.deepEqual(accepted(all, new Set(['syncstore:/not/offered'])), [], 'an id never offered is ignored');
});

// proves: five_layer_stack
test('an offer adds a place and says the old one stays', () => {
  for (const o of offers(found).filter((x) => x.part !== 'transport')) {
    assert.match(o.says, /stay where they are/);
  }
});
