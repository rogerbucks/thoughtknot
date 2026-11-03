// Presets for an AI model (editor spec §19, user_models): each fills a name and an address requests can go to, and
// leaves the model's own name and the key to the person, so nothing is sent until they are given.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AI_PRESETS, modelFromPreset } from '../src/ai-presets.ts';
import { endpointProblem, usable } from '../src/ai-choice.ts';

test('every preset address is one requests can go to', () => {
  for (const p of AI_PRESETS) assert.equal(endpointProblem(p.endpoint), null, p.id);
});

test('a model from a preset has its name and address, no model name and no key, so it is not yet usable', () => {
  const m = modelFromPreset('grok', ['Public', 'Internal']);
  assert.equal(m?.name, 'Grok');
  assert.equal(m?.endpoint, 'https://api.x.ai/v1/chat/completions');
  assert.equal(m?.ceiling, 'Public');
  assert.equal(m?.keyName, '');
  assert.equal(usable(m), false);
  assert.equal(usable({ ...m, model: 'a-model' }), true);
});

test('a preset that is not there gives no model', () => {
  assert.equal(modelFromPreset('nope'), null);
});
