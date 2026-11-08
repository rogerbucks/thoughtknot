// The note CRDT writes the same bytes in JavaScript and in Rust (editor spec ES§40, crdt_transport; ES§41, standalone_app).
// The app has no WebAssembly, so it keeps notes with a Rust build. Devices of either kind read each other's records only
// if the bytes are the same. The file holds the JavaScript bytes, and the Rust tests in the app check them too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as A from '@automerge/automerge';
import { fixture, genesis } from './crdt-fixture.js';

const kept = JSON.parse(readFileSync(new URL('./fixtures/crdt.json', import.meta.url), 'utf8'));

test('the file holds what the JavaScript build makes now', () => {
  assert.deepEqual(fixture(), kept);
});

test('the first change of a note is the same bytes every time', () => {
  assert.equal(Buffer.from(A.getLastLocalChange(genesis('hello world'))).toString('hex'), kept.first.change);
});

test('the edit the file holds opens on top of the first change', () => {
  const hex = (h) => Uint8Array.from(Buffer.from(h, 'hex'));
  let doc = A.init({ actor: kept.edit.actor });
  [doc] = A.applyChanges(doc, [hex(kept.first.change), hex(kept.edit.change)]);
  assert.equal(doc.text, kept.edit.text);
  assert.equal(A.getCursorPosition(doc, ['text'], kept.cursor.cursor), kept.cursor.place);
});
