// A note's classification, read by the core's gate as by the Python library (TRUST-9, cc_classified_asks,
// security_fix_rule). One table of cases, classification-cases.json, holds both readers.
// python/graph_spec/tests/test_classification.py reads it too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classificationOf } from '../src/claude-gate.ts';

const { cases } = JSON.parse(readFileSync(new URL('./classification-cases.json', import.meta.url), 'utf8'));

test('the gate reads each shared classification case as the table says', () => {
  for (const c of cases) {
    const want = c.kind === 'given' ? { kind: 'given', level: c.level } : { kind: c.kind };
    assert.deepEqual(classificationOf(c.text), want, c.name);
  }
});
