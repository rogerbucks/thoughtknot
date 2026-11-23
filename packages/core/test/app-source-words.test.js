// The words of the app's own pages (editor spec §41, standalone_app; §42, words_catalogue), the phone's AI among them
// (ES§19). Every word the app's code asks for is here, and each says something, with both plural forms where it counts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { APP_SOURCE_WORDS } from '../src/app-source-words.ts';

const APP_SRC = new URL('../../app/src/', import.meta.url);
const asked = readdirSync(APP_SRC)
  .filter((f) => f.endsWith('.ts'))
  .flatMap((f) => [...readFileSync(new URL(f, APP_SRC), 'utf8').matchAll(/\bword\('(app\.[a-z0-9.-]+)'/g)])
  .map((m) => m[1]);

describe('the app’s words', () => {
  test('every word the app’s code asks for is in the catalogue', () => {
    assert.ok(asked.length > 0, 'the app’s code is read');
    assert.deepEqual(
      [...new Set(asked)].filter((k) => !(k in APP_SOURCE_WORDS)),
      [],
    );
  });

  test('every word says something, and a counted one has both forms', () => {
    for (const [key, text] of Object.entries(APP_SOURCE_WORDS)) {
      if (typeof text === 'string') assert.ok(text.trim(), key);
      else assert.ok(text.one?.trim() && text.other?.trim(), key);
    }
  });

  test('the phone’s AI words say where a key is kept, and that nothing goes unseen', () => {
    assert.match(APP_SOURCE_WORDS['app.ai.key.where'], /Keychain only/);
    assert.match(APP_SOURCE_WORDS['app.ai.intro'], /only when you tap Send/);
    assert.match(APP_SOURCE_WORDS['app.ai.test.off'], /Turn AI on first/);
  });
});
