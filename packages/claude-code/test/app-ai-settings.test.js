// AI set up on a phone (editor spec ES§19, app_ai_settings; ES§40, phone_more). In the More view, as grouped rows, the
// person turns AI on, adds a model by its address, marks it private or public, sets its ceiling and purpose, and tests
// it with no note sent. What is set is kept on the device, never with a key. In a real Chrome, as a phone, each control
// is a whole row, 44 or more tall.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { aiSection, SETUP_KEY } from '../page/app-ai-settings.ts';
import { phone, until } from './app-ai-fakes.js';
import { chromeHere, phoneApp } from './app-ai-browser.js';

/** The AI group on a phone, and a way to work its controls by what they say. */
async function group(options) {
  const p = await phone(options);
  const section = aiSection(p.win.document, p.ai);
  p.win.document.getElementById('gn-page').append(section);
  const rowOf = (words) =>
    [...section.querySelectorAll('label.gn-ai-row')].filter((l) => l.textContent.startsWith(words));
  const set = (control, value) => {
    control.value = value;
    control.dispatchEvent(new p.win.Event('change'));
  };
  const press = (words) =>
    [...section.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(words)).click();
  const kept = () => JSON.parse(p.win.localStorage.getItem(SETUP_KEY) ?? 'null');
  return { ...p, section, rowOf, set, press, kept };
}

/** Adds a model by name, address and id. */
function add(g, name, address, model) {
  const [n] = g.rowOf('Its name');
  const [a] = g.rowOf('Its address');
  const [m] = g.rowOf('The model’s id');
  n.querySelector('input').value = name;
  a.querySelector('input').value = address;
  m.querySelector('input').value = model;
  g.press('Add the model');
}

describe('AI set up in the More view', () => {
  test('AI is off until the person turns it on, and unlabelled notes count as the highest until changed', async () => {
    const g = await group();
    const [use] = g.rowOf('Use AI');
    assert.equal(use.querySelector('select').value, 'off');
    assert.equal(g.ai.settings().aiUse, 'off');
    assert.equal(g.rowOf('A note with no classification')[0].querySelector('select').value, 'Restricted');
    g.set(g.rowOf('Use AI')[0].querySelector('select'), 'on');
    assert.equal(g.kept().aiUse, 'on');
    assert.equal(g.ai.settings().aiUse, 'on');
  });

  test('a model is added by its address, checked first, and starts public', async () => {
    const g = await group();
    add(g, 'Cloud', 'http://api.example.com/v1', 'gpt');
    assert.match(g.section.querySelector('.gn-ai-said').textContent, /https/, 'an address that would travel unread');
    assert.equal(g.kept(), null, 'nothing kept');
    add(g, 'Mac mini', 'https://mac-mini.tailnet.ts.net/v1', 'llama');
    const [m] = g.kept().aiModels;
    assert.deepEqual(
      [m.name, m.endpoint, m.model, m.reach ?? 'public'],
      ['Mac mini', 'https://mac-mini.tailnet.ts.net/v1', 'llama', 'public'],
    );
    add(g, 'Mac mini', 'https://other.tailnet.ts.net/v1', 'llama');
    assert.match(g.section.querySelector('.gn-ai-said').textContent, /already called Mac mini/);
  });

  test('it is marked private only where its address shows the person runs it, such as a Tailscale name', async () => {
    const g = await group();
    add(g, 'Mac mini', 'https://mac-mini.tailnet.ts.net/v1', 'llama');
    add(g, 'Cloud', 'https://api.example.com/v1', 'gpt');
    const reaches = () => g.rowOf('Whose model it is').map((r) => r.querySelector('select'));
    g.set(reaches()[0], 'private');
    g.set(reaches()[1], 'private');
    assert.deepEqual(
      g.kept().aiModels.map((m) => m.reach ?? 'public'),
      ['private', 'public'],
    );
    assert.match(g.section.querySelector('.gn-ai-said').textContent, /api\.example\.com is not on this device/);
    g.set(reaches()[0], 'public');
    assert.equal(g.kept().aiModels[0].reach, undefined);
  });

  test('its ceiling and purpose are set, and removing it forgets its key', async () => {
    const g = await group();
    add(g, 'Mac mini', 'https://mac-mini.tailnet.ts.net/v1', 'llama');
    g.set(g.rowOf('The highest classification')[0].querySelector('select'), 'Internal');
    g.set(g.rowOf('What it is for')[0].querySelector('select'), 'Research questions');
    const [m] = g.kept().aiModels;
    assert.deepEqual([m.ceiling, m.purpose], ['Internal', 'Research questions']);
    g.device.keychain.set('Mac mini', 'a-key');
    g.press('Remove Mac mini');
    await until(() => g.device.keychain.size === 0);
    assert.deepEqual(g.kept().aiModels, []);
  });

  test('Test asks the address for its models, with its key, and sends no note', async () => {
    const reply = { status: 200, text: JSON.stringify({ data: [{ id: 'llama' }, { id: 'qwen' }] }) };
    const g = await group({ reply });
    add(g, 'Mac mini', 'https://mac-mini.tailnet.ts.net/v1', 'llama');
    g.device.keychain.set('Mac mini', 'a-key');
    g.press('Test Mac mini');
    await until(() => /No note was sent/.test(g.section.textContent));
    assert.equal(g.device.sent.length, 1);
    const [asked] = g.device.sent;
    assert.deepEqual(
      [asked.method, asked.url, asked.body, asked.headers.Authorization],
      ['GET', 'https://mac-mini.tailnet.ts.net/v1/models', '', 'Bearer a-key'],
    );
    assert.match(g.section.textContent, /llama, qwen/);
  });

  test('what is kept on the device holds no key, even one handed in with a model', async () => {
    const g = await group();
    g.ai.save({
      aiUse: 'on',
      aiModels: [{ name: 'M', endpoint: 'https://m.ts.net/v1', model: 'x', key: 'sk-secret' }],
    });
    assert.ok(!g.win.localStorage.getItem(SETUP_KEY).includes('sk-secret'));
  });

  describe('in a real browser, as a phone', () => {
    const { chrome, why } = chromeHere('the AI group of the More view');
    const options = { skip: why ?? false, timeout: 120_000 };
    let app;
    before(async () => {
      if (!why) app = await phoneApp(chrome);
    });
    after(async () => app?.stop());

    test('the AI group shows in More alone, each control a whole row 44 or more tall', options, async () => {
      await app.open();
      const shownOn = () => app.browser.run(`document.querySelector('.gn-ai').getBoundingClientRect().height > 0`);
      assert.equal(await shownOn(), false, 'not on the Board');
      await app.tap('more');
      assert.equal(await shownOn(), true);
      const m = await app.browser.run(`(() => {
        const shown = [...document.querySelectorAll('.gn-ai :is(button, select, input, summary)')]
          .map((e) => [e.textContent.trim().slice(0, 30) || e.getAttribute('aria-label') || e.tagName, e.getBoundingClientRect()])
          .filter(([, r]) => r.height > 0);
        return { controls: shown.map(([n, r]) => [n, Math.round(r.width), Math.round(r.height)]),
          over: document.documentElement.scrollWidth - innerWidth, sent: window.__aiSent.length }; })()`);
      assert.ok(m.controls.length >= 10, `the AI group has ${m.controls.length} controls`);
      for (const [name, width, height] of m.controls) {
        assert.ok(height >= 44, `${name} is ${height} tall`);
        assert.ok(width >= 300, `${name} is ${width} wide: a whole row`);
      }
      assert.ok(m.over <= 0, 'nothing scrolls sideways');
      assert.equal(m.sent, 0, 'opening the group sends nothing');
    });
  });
});
