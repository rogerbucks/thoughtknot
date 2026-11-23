// The record of sends on a phone (editor spec ES§19, app_ai_record). Each send is recorded on the device only: in the
// window's own storage, never in the vault or anything that syncs. It holds no text sent, and the person reads it in
// the More view, newest first.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SENDS_KEY, SENDS_KEPT, deviceSendLog, recordSection } from '../src/app-ai-record.ts';
import { JSDOM } from 'jsdom';

const dom = () => new JSDOM('<main id="gn-page"></main>', { url: 'https://app.test/' }).window;

const record = (n, over = {}) => ({
  id: `send-${n}`,
  at: `2026-11-23T10:0${n % 10}:00.000Z`,
  model: 'Mac mini',
  to: 'https://mac-mini.tailnet.ts.net/v1/chat/completions',
  digest: 'ab'.repeat(32),
  size: 1200 + n,
  scope: { kind: 'graph', things: 2, links: 1 },
  outcome: 'answered',
  ...over,
});

/** A storage that keeps what it is handed, and says each key written. */
function storage() {
  const kept = new Map();
  const written = [];
  return {
    kept,
    written,
    getItem: (k) => kept.get(k) ?? null,
    setItem: (k, v) => {
      written.push(k);
      kept.set(k, String(v));
    },
  };
}

describe('the record of sends on a phone', () => {
  test('each send is kept in this device’s own storage, under its own key alone, newest last', () => {
    const s = storage();
    const log = deviceSendLog(s);
    log.add(record(1));
    log.add(record(2, { outcome: 'failed', why: 'no answer came back' }));
    assert.deepEqual([...new Set(s.written)], [SENDS_KEY]);
    assert.deepEqual(
      log.list().map((r) => [r.id, r.outcome]),
      [
        ['send-1', 'answered'],
        ['send-2', 'failed'],
      ],
    );
  });

  test('only a record’s own fields are kept, so no text sent rides in, and the oldest go past the most kept', () => {
    const s = storage();
    const log = deviceSendLog(s, 3);
    log.add({ ...record(1), body: 'Paris and Rome', note: '# Trip' });
    for (let n = 2; n <= 5; n++) log.add(record(n));
    assert.ok(!s.kept.get(SENDS_KEY).includes('Paris'), 'no text sent is kept');
    assert.deepEqual(
      log.list().map((r) => r.id),
      ['send-3', 'send-4', 'send-5'],
    );
    assert.equal(SENDS_KEPT, 200);
  });

  test('a record that cannot be read is empty, and a store that refuses keeps what it had', () => {
    const s = storage();
    s.kept.set(SENDS_KEY, 'not json');
    assert.deepEqual(deviceSendLog(s).list(), []);
    const refusing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('full');
      },
    };
    assert.doesNotThrow(() => deviceSendLog(refusing).add(record(1)));
  });

  test('it is read in the More view, newest first, with when, the model, where, the size and what came back', () => {
    const win = dom();
    const log = deviceSendLog(win.localStorage);
    const part = recordSection(win.document, log);
    assert.match(part.querySelector('summary').textContent, /: 0/);
    assert.match(part.textContent, /Nothing has been sent/);
    log.add(record(1));
    log.add(record(2, { outcome: 'failed' }));
    part.open = true;
    part.dispatchEvent(new win.Event('toggle'));
    const lines = [...part.querySelectorAll('li')].map((li) => li.textContent);
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^2026-11-23 10:02:00\.000 UTC: Mac mini at https:\/\/mac-mini\.tailnet\.ts\.net/);
    assert.match(lines[0], /1,202 bytes, failed$/);
    assert.match(lines[1], /answered$/);
    assert.match(part.textContent, /Kept on this iPhone only/);
  });

  test('the page keeps it nowhere but the window’s own storage: no vault call and no synced store', () => {
    const source = readFileSync(new URL('../src/app-ai-record.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /fetch\(|\/api\/|writeWhole|indexedDB|invoke\(/);
  });
});
