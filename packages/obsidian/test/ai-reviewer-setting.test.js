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

const press = (r) => r.querySelector('button').dispatch('click');
const LM = { name: 'LM Studio', endpoint: 'https://lmstudio.taila0fac4.ts.net/v1', model: 'm', reach: 'private' };

describe('the address is easy to find, set and test (user_models)', () => {
  test('the list shows each model’s address and whether it is private; its page starts with the address', async () => {
    const env = await load({ data: { settings: { aiModels: [LM] } } });
    try {
      const el = page(env);
      assert.match(desc(row(el, 'Model 1')), /lmstudio\.taila0fac4\.ts\.net\/v1 \(private\)/);
      const names = [...row(el, 'Model 1').querySelectorAll('.setting-item-name')].map((n) => n.textContent);
      assert.deepEqual(names.slice(1, 4), ['Name', 'Address (URL)', 'Private reviewer']);
    } finally {
      env.uninstall();
    }
  });

  test('Test asks the address for its models, with the key, and says what answered; no note is sent', async () => {
    const env = await load({ data: { settings: { aiModels: [{ ...LM, keyName: 'lm' }] } } });
    try {
      env.state.secrets.set('lm', 'the-key');
      env.state.reply = () => ({ status: 200, text: JSON.stringify({ data: [{ id: 'qwen3' }, { id: 'gemma' }] }) });
      press(row(page(env), 'Test connection'));
      await until(() => env.state.notices.length > 0);
      assert.equal(env.state.requests.length, 1);
      const [req] = env.state.requests;
      assert.equal(req.url, 'https://lmstudio.taila0fac4.ts.net/v1/models');
      assert.equal(req.method, 'GET');
      assert.equal(req.headers.Authorization, 'Bearer the-key');
      assert.equal(req.body, undefined);
      assert.match(env.state.notices.at(-1), /answered\. Models: qwen3, gemma/);
    } finally {
      env.uninstall();
    }
  });

  test('an address that would travel unencrypted is refused before anything goes', async () => {
    const plain = { ...LM, endpoint: 'http://lmstudio.taila0fac4.ts.net/v1' };
    const env = await load({ data: { settings: { aiModels: [plain] } } });
    try {
      press(row(page(env), 'Test connection'));
      await until(() => env.state.notices.length > 0);
      assert.equal(env.state.requests.length, 0);
      assert.match(env.state.notices.at(-1), /Not tested: .*https/);
    } finally {
      env.uninstall();
    }
  });

  test('a reply that is not a 2xx, such as a wrong key or a redirect, says to check the address and key', async () => {
    const env = await load({ data: { settings: { aiModels: [LM] } } });
    try {
      for (const status of [401, 302]) {
        env.state.notices.length = 0;
        env.state.reply = () => ({ status, text: '' });
        press(row(page(env), 'Test connection'));
        await until(() => env.state.notices.length > 0);
        assert.match(env.state.notices.at(-1), new RegExp(`status ${status}: check the address and key`));
      }
    } finally {
      env.uninstall();
    }
  });

  test('an address that cannot be reached says so', async () => {
    const env = await load({ data: { settings: { aiModels: [LM] } } });
    try {
      press(row(page(env), 'Test connection'));
      await until(() => env.state.notices.length > 0);
      assert.match(env.state.notices.at(-1), /could not be reached: net::ERR_CONNECTION_REFUSED/);
    } finally {
      env.uninstall();
    }
  });
});
