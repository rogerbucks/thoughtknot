// Keys found in what would cross (editor spec §40, boundary_contract). A JSON Web Key's private part is found, in one
// object. Each object is looked at on its own, so no pattern runs over the whole text (the code scan holds that).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { JWK_PRIVATE, keysIn } from '../src/index.ts';

describe('keysIn', () => {
  test('finds a JSON Web Key with its private part, and passes one with its public part only', () => {
    assert.deepEqual(keysIn('{"kty":"EC","crv":"P-256","d":"8m2RkGQbqzJm3hU2Vf1PZgk4aE9yF6c"}'), [JWK_PRIVATE]);
    assert.deepEqual(keysIn('{"d":"8m2RkGQbqzJm3hU2Vf1PZgk4aE9yF6c","kty":"EC"}'), [JWK_PRIVATE]);
    assert.deepEqual(keysIn('{"kty":"EC","crv":"P-256","x":"f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU"}'), []);
    assert.deepEqual(keysIn('{"kty":"EC"} {"d":"8m2RkGQbqzJm3hU2Vf1PZgk4aE9yF6c"}'), [], 'two objects are not one key');
  });
});
