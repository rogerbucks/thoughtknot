// Every store of notes read in parts gives the same answers (editor spec ES§53, scale_parts_store_swap):
// parts-store-contract.ts. A host may bring its own store, such as the desktop app's file on disk. It is held to the
// same contract as the memory store. A store that answers out of order, or keeps a dropped note, is refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memoryBackend, sqliteBackend } from '../src/mesh-index.ts';
import { storeOver } from '../src/parts-store.ts';
import { contractCases, partsStoreContract } from '../src/parts-store-contract.ts';
import { FIXTURE, fixtureText } from './parts-store-fixture.js';
import { sqlEngine } from './mesh-test-sql.js';

/** Runs every check of the contract on the stores `make` gives; the names of those that failed. */
async function failed(make) {
  const out = [];
  for (const check of partsStoreContract(make))
    await check.run().catch((e) => out.push(`${check.name}: ${e.message.slice(0, 200)}`));
  return out;
}

test('the memory store and SQLite in the page both keep the contract', async () => {
  assert.deepEqual(await failed(async () => storeOver(memoryBackend())), []);
  assert.deepEqual(await failed(async () => storeOver(sqliteBackend(await sqlEngine()))), []);
});

test('a store that answers out of order, or keeps what it was told to drop, breaks the contract', async () => {
  const backwards = async () => {
    const s = storeOver(memoryBackend());
    return { ...s, briefs: async (note) => (await s.briefs(note)).reverse() };
  };
  assert.match((await failed(backwards)).join('\n'), /briefs of notes\/one\.md/);
  const keeps = async () => ({ ...storeOver(memoryBackend()), drop: async () => undefined });
  assert.match((await failed(keeps)).join('\n'), /a dropped note/);
});

test('the cases put notes with odd words, many groups of links, and a note put twice', async () => {
  const { rows, asks } = await contractCases();
  const big = rows[1];
  assert.ok(big.groups.length >= 3 && big.between.length >= 1, 'groups linked to each other');
  assert.ok(big.things.some((t) => t.props.includes('DROP TABLE')));
  assert.ok(big.things.some((t) => t.props.includes('😀')));
  assert.equal(rows[2].note, rows[3].note, 'a note put twice');
  assert.ok(
    asks.some((a) => a.ask === 'touching' && a.keys.length > 400),
    'more keys than one query names',
  );
  assert.ok(asks.some((a) => a.note === 'never put.md' && a.answer === null));
});

test('the file a store in another language is checked against holds what the memory store answers now', async () => {
  assert.equal(
    readFileSync(FIXTURE, 'utf8'),
    await fixtureText(),
    'run node packages/core/test/parts-store-fixture.js --write',
  );
});
