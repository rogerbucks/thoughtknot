// The send sheet on a phone (editor spec ES§19, app_ai_send_sheet). It shows exactly what will be sent and to which
// model, and nothing is sent until Send is tapped, once. Cancel and Escape send nothing. In a real Chrome, as a phone,
// its buttons are 44 by 44 or more, and the board's Ask AI box opens it.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSendSheet } from '../../app/src/app-ai-send-sheet.ts';
import { NOTE, OWN, phone, until } from './app-ai-fakes.js';
import { chromeHere, phoneApp } from './app-ai-browser.js';

const SETUP = {
  aiUse: 'on',
  // models the person runs, with no key: one needs none
  aiModels: [
    { ...OWN, keyName: '' },
    { ...OWN, name: 'Studio', endpoint: 'http://localhost:1234/v1', keyName: '' },
  ],
  aiUnlabelled: 'Public',
};
const ASK = { note: NOTE, notePath: 'Trip.md', choice: { graph: 'trip', what: 'graph' }, question: 'What is near?' };

/** The sheet opened on AI with two models, and what came of it. */
async function sheetOn() {
  const { ai, device, win } = await phone({ setup: SETUP });
  const doc = win.document;
  const results = [];
  const ask = { choices: ai.choices('Research questions'), prepare: (model) => ai.prepare({ ...ASK, model }) };
  const sheet = await openSendSheet(doc, ai, ask, (r) => results.push(r));
  return { ai, device, doc, sheet, results, win };
}

describe('the send sheet on a phone', () => {
  test('shows exactly what will be sent and to which model, and nothing goes before Send', async () => {
    const { ai, device, doc, sheet } = await sheetOn();
    assert.equal(sheet.getAttribute('role'), 'dialog');
    assert.equal(doc.activeElement.textContent, 'Cancel', 'Cancel has the focus first');
    const p = await ai.prepare({ ...ASK, model: OWN.name });
    assert.equal(sheet.querySelector('.gn-ai-sheet-sent').textContent, p.body, 'byte for byte');
    assert.equal(sheet.querySelector('.gn-ai-sheet-to').textContent, `To Mac mini, at ${p.to}`);
    assert.equal(device.sent.length, 0);
  });

  test('picking another model shows that one’s request instead', async () => {
    const { ai, sheet, win, device } = await sheetOn();
    const pick = sheet.querySelector('select');
    pick.value = 'Studio';
    pick.dispatchEvent(new win.Event('change'));
    const p = await ai.prepare({ ...ASK, model: 'Studio' });
    await until(() => sheet.querySelector('.gn-ai-sheet-to').textContent.includes('localhost:1234'));
    assert.equal(sheet.querySelector('.gn-ai-sheet-sent').textContent, p.body);
    assert.equal(device.sent.length, 0);
  });

  test('Send sends exactly what is shown, once; Cancel and Escape send nothing', async () => {
    const { sheet, device, results, doc } = await sheetOn();
    const shown = sheet.querySelector('.gn-ai-sheet-sent').textContent;
    const send = sheet.querySelector('.gn-ai-sheet-send');
    send.click();
    send.click();
    await until(() => results.length === 1);
    assert.equal(device.sent.length, 1, 'once');
    assert.equal(device.sent[0].body, shown);
    assert.ok('proposal' in results[0], JSON.stringify(results[0]));
    assert.equal(doc.querySelector('.gn-ai-sheet'), null, 'the sheet closes');

    const other = await sheetOn();
    other.sheet.querySelector('.gn-ai-sheet-cancel').click();
    const third = await sheetOn();
    third.sheet.dispatchEvent(new third.win.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.deepEqual([other.results, third.results], [[null], [null]]);
    assert.equal(other.device.sent.length + third.device.sent.length, 0);
  });

  test('with no model offered, it says so and Send stays off', async () => {
    const { ai, win } = await phone({ setup: { aiUse: 'on', aiModels: [] } });
    const sheet = await openSendSheet(
      win.document,
      ai,
      { choices: [], prepare: async () => ({ refused: 'none' }) },
      () => {},
    );
    assert.match(sheet.textContent, /No model may be sent this/);
    assert.equal(sheet.querySelector('.gn-ai-sheet-send').disabled, true);
  });

  describe('in a real browser, as a phone', () => {
    const { chrome, why } = chromeHere('the send sheet');
    const options = { skip: why ?? false, timeout: 120_000 };
    let app;
    before(async () => {
      if (!why) app = await phoneApp(chrome);
    });
    after(async () => app?.stop());

    test('the board’s Ask AI opens the sheet, its buttons 44 by 44 or more, and nothing is sent', options, async () => {
      await app.open();
      await app.browser.run(`(() => {
        const box = document.querySelector('.thoughtknot-board-list-ask input');
        box.value = 'A board of the ideas';
        document.querySelector('.thoughtknot-board-list-ask button').click(); })()`);
      await app.wait(`Boolean(document.querySelector('.gn-ai-sheet-sent')?.textContent)`);
      const m = await app.browser.run(`(() => {
        const sheet = document.querySelector('.gn-ai-sheet');
        const buttons = [...sheet.querySelectorAll('button, select')].map((b) => {
          const r = b.getBoundingClientRect(); return [b.textContent.trim().slice(0, 20), Math.round(r.width), Math.round(r.height)]; });
        const r = sheet.getBoundingClientRect();
        return { buttons, bottom: Math.round(r.bottom), to: sheet.querySelector('.gn-ai-sheet-to').textContent,
          sent: window.__aiSent.length }; })()`);
      assert.match(m.to, /Mac mini, at https:\/\/mac-mini\.tailnet\.ts\.net/);
      assert.equal(m.buttons.length, 3, 'the model, Cancel and Send');
      for (const [name, width, height] of m.buttons)
        assert.ok(width >= 44 && height >= 44, `${name} is ${width} by ${height}`);
      assert.equal(m.bottom, 852, 'a sheet from the foot of the screen');
      assert.equal(m.sent, 0, 'nothing is sent until Send is tapped');
    });
  });
});
