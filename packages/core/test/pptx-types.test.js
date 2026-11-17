// What a PowerPoint deck is read into, and the limits it is read under (ES§45 board_exchange).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Over, PPTX_LIMITS } from '../src/pptx-types.ts';

describe('pptx_types', () => {
  test('a limit passed carries why and the most that was allowed, for the sentence', () => {
    const e = new Over('too-many-slides', 7);
    assert.deepEqual([e instanceof Error, e.why, e.most], [true, 'too-many-slides', 7]);
    assert.equal(new Over('too-large').most, 0);
  });

  test('the limits are finite, and a picture limit is not above the part limit', () => {
    for (const [name, n] of Object.entries(PPTX_LIMITS)) assert.ok(Number.isFinite(n) && n > 0, name);
    assert.ok(PPTX_LIMITS.part <= PPTX_LIMITS.inflated);
  });
});
