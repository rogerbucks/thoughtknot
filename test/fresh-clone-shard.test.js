// The fresh clone can run one share of the test files (quality_ratchet, CODE-3): six machines split the suite.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { withTestShard } from '../scripts/fresh-clone.mjs';

describe('the fresh clone test shard', () => {
  test('npm test gets the shard flag and other lines stay as they are', () => {
    assert.equal(
      withTestShard('npm ci\nnpm test\nnpm run build', '2/6'),
      'npm ci\nnpm test -- --test-shard=2/6\nnpm run build',
    );
    assert.equal(withTestShard('npm run test:ai', '2/6'), 'npm run test:ai');
  });
});
