// The page's calls run against the real editor server, never a fake (spec §26, cc_write_if_unchanged; risk API-4).
// Each reply has the shape api-types.ts gives it, which the page and the server both import. Each refusal, whatever its
// status, is JSON with a `why`. The page says that why, not only a status, so a person reads "the note is gone" rather
// than "410".
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { noteCalls } from '../page/note-calls.ts';
import { serverCalls } from '../page/server-calls.ts';
import { whyOf } from '../src/api-types.ts';
import { PLAN, PLAN_THEIRS, served, tempVault } from './editor-store-support.js';

const sha = (bytes) => `"${createHash('sha256').update(bytes).digest('hex')}"`;

/** A vault, its store served, the plan opened, and a fetch that calls the server as the page's own origin does. */
async function opened() {
  const v = tempVault();
  const { store, server } = await served(v);
  const o = await store.open('Notes/plan.md');
  assert.equal(o.ok, true, o.why);
  const fetcher = (path, init = {}) =>
    fetch(server.origin + path, {
      ...init,
      headers: { origin: server.origin, 'sec-fetch-site': 'same-origin', ...init.headers },
    });
  return { v, s: server, id: o.id, version: sha(readFileSync(v.plan)), fetcher };
}

describe('the replies have their shared shapes', () => {
  test('a note read is a NoteReply, a write a WriteReply', async () => {
    const { s, id, version, fetcher } = await opened();
    const note = await serverCalls(s.token, fetcher).note(id);
    assert.deepEqual(Object.keys(note).sort(), ['draft', 'text', 'version']);
    assert.deepEqual(note, { text: PLAN, version, draft: null });
    const written = await noteCalls(s.token, fetcher).write(id, PLAN_THEIRS, version);
    assert.equal(written.ok, true);
    assert.equal(written.version, sha(PLAN_THEIRS));
  });

  test('a stale write is a StaleWrite: the server’s why, the note as it is now, and the draft kept', async () => {
    const { v, s, id, version, fetcher } = await opened();
    writeFileSync(v.plan, PLAN_THEIRS);
    const reply = await fetcher(`/api/notes/${id}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${s.token}`, 'if-match': version },
      body: PLAN + 'mine\n',
    });
    assert.equal(reply.status, 409);
    const body = await reply.json();
    assert.deepEqual(Object.keys(body).sort(), ['draft', 'text', 'version', 'why']);
    assert.match(body.why, /changed after the page read it/);
    assert.deepEqual([body.text, body.version, body.draft], [PLAN_THEIRS, sha(PLAN_THEIRS), true]);
  });
});

describe('every refusal is JSON with a why', () => {
  const calls = [
    ['no token (401)', () => ['/api/notes/x', {}]],
    ['a method the server never takes (405)', (s) => ['/api/settings', { method: 'POST', headers: auth(s) }]],
    ['a route there is none of (404)', (s) => ['/api/nowhere', { headers: auth(s) }]],
    [
      'a change from another origin (403)',
      (s) => ['/api/notes/x', { method: 'PUT', headers: { ...auth(s), origin: 'http://elsewhere' } }],
    ],
    [
      'a write naming no version (428)',
      (s, id) => [`/api/notes/${id}`, { method: 'PUT', headers: auth(s), body: 'x' }],
    ],
  ];
  const auth = (s) => ({ authorization: `Bearer ${s.token}` });
  for (const [what, call] of calls)
    test(what, async () => {
      const { s, id, fetcher } = await opened();
      const reply = await fetcher(...call(s, id));
      assert.ok(reply.status >= 400, String(reply.status));
      assert.match(reply.headers.get('content-type') ?? '', /^application\/json/, 'sent as JSON');
      const why = whyOf(await reply.json());
      assert.equal(typeof why, 'string');
      assert.ok(why.length > 10, why);
    });

  test('the page says the server’s why for a write refused because the note is gone (410)', async () => {
    const { v, s, id, version, fetcher } = await opened();
    rmSync(v.plan);
    const written = await noteCalls(s.token, fetcher).write(id, PLAN_THEIRS, version);
    assert.equal(written.ok, false);
    assert.equal(written.status, 410);
    assert.doesNotMatch(written.why, /410/, 'the server’s words, not its status');
    assert.ok(written.why.length > 10);
  });

  test('the page says the server’s why when a read is refused', async () => {
    const { s, fetcher } = await opened();
    await assert.rejects(serverCalls(s.token, fetcher).note('0'.repeat(32)), (e) => {
      assert.doesNotMatch(e.message, /^\{/, 'never the JSON itself');
      return /404/.test(e.message);
    });
  });
});
