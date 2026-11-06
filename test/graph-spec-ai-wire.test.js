// The graph spec gives the wire an AI reads and writes (editor spec §51, spec_ai_wire).
// requirements/graph-spec-ai-wire.json holds it. This holds the JavaScript library to it.
// The change set's header is read to the listed fields, and the serving rule pins the listed ones.
// python/graph_spec/tests/test_ai_wire.py holds the view server to the fence and the budget.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const C = createRequire(import.meta.url)('../packages/graph-spec/src/graph-spec-check.js');
const WIRE = JSON.parse(readFileSync(new URL('../requirements/graph-spec-ai-wire.json', import.meta.url), 'utf8'));
const serving = readFileSync(new URL('../packages/graph-spec/src/rules/servings.js', import.meta.url), 'utf8');
const HASH = 'a1b2c3d4e5f60718';
const header = (extra = '') =>
  `// graph: g1 · CHANGE SET cs-1 · against sha-256-64:${HASH} · by model:one${extra}\nINSERT (x:Fact {})`;

describe('spec_ai_wire', () => {
  test('a change set header written as listed is read to the listed fields', () => {
    assert.match(WIRE.changeSetHeader.line, /CHANGE SET <id> · against sha-256-64:<state hash> · by <author>/);
    const h = C.changesetHeader(header());
    assert.deepEqual(Object.keys(h), WIRE.changeSetHeader.fields);
    assert.deepEqual(h, { graph: 'g1', id: 'cs-1', against: HASH, by: 'model:one' });
  });

  test('a header that does not follow the listed line is not read as one', () => {
    assert.equal(C.changesetHeader(`// graph: g1 · CHANGE SET cs-1 · against 123 · by model:one`), null);
    assert.equal(C.changesetHeader(`// graph: g1 · CHANGE SET cs-1 · by model:one`), null);
  });

  test('the serving rule compares a pin to its serving on the listed fields, and no others', () => {
    for (const k of WIRE.servingRecord.pinned) assert.ok(serving.includes(`'${k}'`), `${k} is compared`);
    const compared = /\[((?:'\w+',? ?)+)\]\.every/.exec(serving);
    assert.ok(compared, 'the rule lists the fields it compares');
    assert.deepEqual(
      [...compared[1].matchAll(/'(\w+)'/g)].map((m) => m[1]),
      WIRE.servingRecord.pinned,
    );
    for (const k of WIRE.servingRecord.pinned) assert.ok(WIRE.servingRecord.fields.includes(k));
  });

  test('the list gives the fence marks and the unit of the budget', () => {
    assert.match(WIRE.fence.open, /^<<<data <nonce>/);
    assert.match(WIRE.fence.close, /^<<<end data <nonce>/);
    assert.equal(WIRE.budget.unit, 'tokens');
  });
});
