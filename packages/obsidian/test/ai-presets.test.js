// Presets for an AI model (editor spec §19, user_models). Each fills a name and an address requests can go to.
// The person gives the model's name and key. Until then nothing is sent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AI_PRESETS } from '../src/settings/ai-presets.ts';
import { endpointProblem, usable } from '../../core/src/ai-choice.ts';
import { word } from '../../core/src/words.ts';
import { aiModel } from '../../core/src/ai-model.ts';

test('every preset address is one requests can go to', () => {
  for (const p of AI_PRESETS) assert.equal(endpointProblem(p.endpoint), null, p.id);
});

test('a model made from a preset has no model name and no key, so it is not yet usable', () => {
  const p = AI_PRESETS.find((x) => x.id === 'grok');
  const m = aiModel({ name: word(p?.name), endpoint: p?.endpoint }, ['Public', 'Internal']);
  assert.equal(m.name, 'Grok');
  assert.equal(m.ceiling, 'Public');
  assert.equal(m.keyName, '');
  assert.equal(usable(m), false);
  assert.equal(usable({ ...m, model: 'a-model' }), true);
});

test('LM Studio is offered, on this device by default, and starts as a private reviewer', () => {
  const p = AI_PRESETS.find((x) => x.id === 'lmstudio');
  assert.equal(p?.endpoint, 'http://localhost:1234/v1');
  assert.equal(p?.reach, 'private');
  assert.equal(word(p?.name), 'LM Studio (your own, private)');
});
