// Marking a model as a private reviewer on the settings page (editor spec §19, ai_two_reviewers, ai_private_is_own). A
// model is public until marked. One marked private at an address that is not the user's own says why it cannot be.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { build, load, until } from './host/load-plugin.js';

before(build);

function page(env) {
  const tab = env.state.settingTabs[0];
  tab.display();
  return tab.containerEl;
}
const row = (el, name) =>
  el.querySelectorAll('.setting-item').find((r) => r.querySelector('.setting-item-name')?.textContent === name);
const desc = (r) => r.querySelector('.setting-item-description').textContent;

describe('a private reviewer is marked on the model’s page', () => {
  test('public until the toggle is turned on, and saved as private', async () => {
    const lm = { name: 'LM Studio', endpoint: 'https://lmstudio.taila0fac4.ts.net/v1', model: 'm' };
    const env = await load({ data: { settings: { aiModels: [lm] } } });
    try {
      const toggle = row(page(env), 'Private reviewer').querySelector('input');
      assert.equal(toggle.checked, false);
      toggle.checked = true;
      toggle.dispatch('change');
      await until(() => env.state.data?.settings?.aiModels?.[0]?.reach === 'private');
      assert.match(desc(row(page(env), 'Private reviewer')), /A model you run/);
      assert.doesNotMatch(desc(row(page(env), 'Model 1')), /cannot be a private reviewer/);
    } finally {
      env.uninstall();
    }
  });

  test('a cloud address marked private says it cannot be one', async () => {
    const cloud = { name: 'Cloud', endpoint: 'https://api.example.com/v1', model: 'm', reach: 'private' };
    const env = await load({ data: { settings: { aiModels: [cloud] } } });
    try {
      assert.match(desc(row(page(env), 'Model 1')), /api\.example\.com is not on this device or your own network/);
    } finally {
      env.uninstall();
    }
  });
});
