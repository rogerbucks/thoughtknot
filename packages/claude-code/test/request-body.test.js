// A refused body is let arrive before the refusal (spec §26, cc_body_limit). The connection is then closed with
// nothing left coming, so the sender reads the refusal instead of a reset.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { drained } from '../server/request-body.ts';

describe('a refused body is drained before the refusal', () => {
  test('it waits for the rest of the body, and throws it away', async () => {
    const req = new PassThrough();
    let done = false;
    const waiting = drained(req, 60_000).then(() => (done = true));
    req.write('x'.repeat(1000));
    await new Promise((r) => setImmediate(r));
    assert.equal(done, false, 'not while the body is still coming');
    req.end('y');
    await waiting;
    assert.equal(done, true);
  });

  test('a body that never ends is waited for no longer than the time given', async () => {
    const req = new PassThrough();
    await drained(req, 10);
    assert.equal(req.readableEnded, false);
  });
});
