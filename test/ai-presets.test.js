// Presets for an AI model (editor spec §19, user_models). Each fills a name and an address requests can go to.
// The person gives the model's name and key. Until then nothing is sent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AI_PRESETS } from '../packages/obsidian/src/settings/ai-presets.ts';
import { endpointProblem, usable } from '../packages/core/src/ai-choice.ts';
import { aiModel } from '../packages/core/src/ai-model.ts';

test('every preset address is one requests can go to', () => {
  for (const p of AI_PRESETS) assert.equal(endpointProblem(p.endpoint), null, p.id);
});

test('a model made from a preset has no model name and no key, so it is not yet usable', () => {
  const p = AI_PRESETS.find((x) => x.id === 'grok');
  const m = aiModel({ name: p?.name, endpoint: p?.endpoint }, ['Public', 'Internal']);
  assert.equal(m.name, 'Grok');
  assert.equal(m.ceiling, 'Public');
  assert.equal(m.keyName, '');
  assert.equal(usable(m), false);
  assert.equal(usable({ ...m, model: 'a-model' }), true);
});
