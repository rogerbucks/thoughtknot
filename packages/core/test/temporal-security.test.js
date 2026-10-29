// Temporal security (editor spec §65, TS1; risk SEC-19): temporal.ts, and where the history, the layout cache and the
// permissions use it.
// - temporal_erased_stays_erased: an erased thing, link or property is gone from the as-at view at every earlier
//   moment. It is gone from the change log, the edit inbox's history, the layout cache and an export too.
// - temporal_clock_not_trusted: a device with its clock a year ahead or behind joins the same edits in any order. It
//   gets the same graph. Its edits neither win nor vanish because of the date.
// - temporal_replay_refused: a replayed edit changes nothing, and a key taken away stops the edits signed with it.
// - temporal_checked_at_use: an expired link, token or grant is refused when used. A permission taken away between
//   the ask and the write stops the write, and a stale cache is refused.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import gs from '@thoughtknot/graph-spec';
import { MeshHistory } from '../src/mesh-history.ts';
import { LayoutCache } from '../src/layout-cache.ts';
import { Permissions } from '../src/permissions.ts';
import { gqlBlock } from '../src/export-data-gql.ts';
import { EditInbox, HybridClock, MOST_AHEAD, atUse, eraseInNote, useCached, writeChecked } from '../src/temporal.ts';

const YEAR = 365 * 24 * 3600 * 1000;
const T0 = Date.parse('2026-10-28T10:00:00Z');

/** A note holding one document block with these lines. */
const note = (doc, ...lines) =>
  ['# Notes', '```gql', `// graph: shop · document ${doc} · schema s1 · as of 2026-10-01`, ...lines, '```'].join('\n');

/** A clock that reads each of `times` in turn, and the last one after. */
const clock = (times) => {
  let i = 0;
  return () => times[Math.min(i++, times.length - 1)];
};

/** The things and links of every block of a note, as one graph's ids and link texts. */
function contents(text) {
  const out = { things: [], links: [], props: {} };
  for (const m of text.matchAll(/```gql\n([\s\S]*?)\n```/g)) {
    const store = new gs.Store();
    const name = store.apply(m[1]);
    const g = gs.worldFromStore(store)[name];
    if (!g) continue; // a block with nothing left in it reads to no graph
    for (const [id, [, p]] of g.nodes) (out.things.push(id), (out.props[id] = p));
    for (const [a, t, b] of g.edges) out.links.push(`${a}-${t}-${b}`);
  }
  return out;
}

describe('temporal_erased_stays_erased', () => {
  test('an erased thing is gone from every earlier moment, the log, the inbox, the layout cache and an export', async () => {
    const h = new MeshHistory(
      clock(['2026-10-01T09:00', '2026-10-01T10:00', '2026-10-01T11:00', '2026-10-01T12:00', '2026-10-01T13:00']),
    );
    const secret = "(salary:Fact {id: 'salary', amount: 90000})";
    h.change('a.md', note('doc:a', "(ann:Person {name: 'Ann'}),", `${secret},`, '(ann)-[:EARNS]->(salary)'), 'Ann');
    h.change('b.md', note('doc:b', "(salary:Fact {id: 'salary', amount: 95000})"), 'Ben');
    h.join(['a.md', 'b.md'], 'sync'); // leaves the salary contested, so the log names its claims
    assert.ok(
      h.log().some((e) => e.detail.some((d) => d.includes('salary'))),
      'the log named it before',
    );
    h.change('a.md', note('doc:a', "(ann:Person {name: 'Ann'})"), 'Ann'); // the person takes it out of the note
    h.erase({ thing: 'salary' }, 'Ann');
    for (const at of ['2026-10-01T09:00', '2026-10-01T10:00', '2026-10-01T11:00', '2026-10-01T12:00']) {
      const texts = h.textsAt(at);
      for (const [path, text] of Object.entries(texts)) {
        assert.ok(!text.includes('salary') && !text.includes('90000'), `${path} at ${at} holds nothing of it`);
        // an export made from the history at that moment holds nothing of it either
        const c = contents(text);
        const data = { graph: 'shop', things: c.things.map((id) => [id, [], c.props[id]]), links: [] };
        assert.ok(!gqlBlock(data, { note: path, date: at }).includes('salary'));
      }
      assert.ok(!JSON.stringify(h.joinAt(['a.md', 'b.md'], at)).includes('salary'), `the join at ${at}`);
    }
    assert.deepEqual(contents(h.textsAt('2026-10-01T09:00')['a.md']).things, ['ann'], 'Ann herself is kept');
    const log = JSON.stringify(h.log());
    assert.ok(!log.includes('salary'), 'the log names nothing of it');
    assert.equal(h.log().at(-1).kind, 'erase');

    // the edit inbox, the history sync keeps, holds nothing of it either
    const inbox = new EditInbox(new HybridClock('me', () => T0));
    inbox.receive({
      device: 'ann',
      seq: 1,
      note: 'a.md',
      text: note('doc:a', secret),
      stamp: stamp('ann', T0),
      key: 'k',
    });
    inbox.erase({ thing: 'salary' });
    assert.ok(!JSON.stringify(inbox.all()).includes('salary'));

    // a saved layout that shows it is thrown away, in memory and in the host's store
    const kept = new Map();
    const store = {
      get: async (k) => kept.get(k),
      set: async (k, v) => void kept.set(k, v),
      keys: async () => [...kept.keys()],
      delete: async (k) => void kept.delete(k),
    };
    const cache = new LayoutCache(store);
    const box = (of) => ({
      space: { width: 100, height: 50 },
      marks: [{ id: `t:${of}`, kind: 'box', style: 'thing', of, x: 10, y: 10, width: 80, height: 30 }],
    });
    await cache.set('layout:1:with', box('salary'));
    await cache.set('layout:1:without', box('ann'));
    assert.equal(await cache.erase((saved) => saved.includes('salary')), true);
    assert.deepEqual([...kept.keys()], ['layout:1:without']);
    assert.equal(await cache.get('layout:1:with'), null, 'memory holds it no more');
    assert.ok(await cache.get('layout:1:without'));
  });

  test('an erased property goes, and the thing stays', () => {
    const text = note(
      'doc:a',
      "(ann:Person {name: 'Ann', phone: '0400'}),",
      "(bob:Person {name: 'Bob'}),",
      '(ann)-[:KNOWS]->(bob)',
    );
    const erased = eraseInNote(text, { thing: 'ann', key: 'phone' });
    assert.ok(!erased.includes('0400'));
    const c = contents(erased);
    assert.deepEqual(c.things.sort(), ['ann', 'bob']);
    assert.deepEqual(c.links, ['ann-KNOWS-bob']);
    assert.ok(
      erased.startsWith('# Notes\n```gql\n// graph: shop · document doc:a'),
      'the note and its header are kept',
    );
  });

  test('a link to an erased thing goes with it, and a note without it is left as it is', () => {
    const text = note('doc:a', "(ann:Person {name: 'Ann'}),", "(bob:Person {name: 'Bob'}),", '(ann)-[:KNOWS]->(bob)');
    assert.deepEqual(contents(eraseInNote(text, { thing: 'bob' })), {
      things: ['ann'],
      links: [],
      props: { ann: { id: 'ann', name: 'Ann' } },
    });
    assert.equal(eraseInNote(text, { thing: 'carol' }), text);
  });
});

/** A stamp as a device's clock gives it, `wall` ms. */
const stamp = (device, wall) => ({ wall, count: 0, device });

/** Two devices' edits to one note: each device's own version, stamped by its own clock. */
function edits(skew) {
  const a = new HybridClock('ann', () => T0);
  const b = new HybridClock('ben', () => T0 + skew);
  return [
    {
      device: 'ann',
      seq: 1,
      note: 'n.md',
      text: note('doc:ann', "(w:Product {id: 'w', price: 10})"),
      stamp: a.tick(),
      key: 'ka',
    },
    {
      device: 'ben',
      seq: 1,
      note: 'n.md',
      text: note('doc:ben', "(w:Product {id: 'w', price: 12})"),
      stamp: b.tick(),
      key: 'kb',
    },
    {
      device: 'ann',
      seq: 2,
      note: 'n.md',
      text: note('doc:ann', "(w:Product {id: 'w', price: 11})"),
      stamp: a.tick(),
      key: 'ka',
    },
  ];
}

/** The graph one device ends with, having heard `list` in that order. */
function merged(list, wall = () => T0) {
  const inbox = new EditInbox(new HybridClock('me', wall));
  for (const e of list) assert.equal(inbox.receive(e), 'kept');
  return inbox;
}

describe('temporal_clock_not_trusted', () => {
  test('a clock a year ahead or behind joins the same edits in any order to the same graph', () => {
    const right = merged(edits(0)).merged();
    for (const skew of [YEAR, -YEAR]) {
      const list = edits(skew);
      for (const order of [list, [...list].reverse(), [list[1], list[0], list[2]]]) {
        const inbox = merged(order);
        assert.deepEqual(inbox.merged(), right, `skewed by ${skew}`);
        // both devices' latest versions are held: none won or went because of its date
        assert.deepEqual(
          inbox.latest().map((e) => `${e.device}#${e.seq}`),
          ['ann#2', 'ben#1'],
        );
      }
    }
    assert.equal(right.conflicts.length, 1, 'the clash is kept, never settled by a date');
  });

  test("a stamp from a clock too far ahead is kept, never taken up, so this device's time stays its own", () => {
    const now = () => T0;
    const me = new HybridClock('me', now);
    assert.equal(me.hear(stamp('ben', T0 + YEAR)), false);
    assert.ok(me.tick().wall < T0 + MOST_AHEAD);
    const inbox = merged([edits(YEAR)[1]], now);
    assert.deepEqual(inbox.clockAhead, ['ben#1']);
    assert.equal(inbox.latest().length, 1, 'its edit is kept');
  });

  test('what a device does after hearing an edit sorts after it, even when its own clock is behind', () => {
    const behind = new HybridClock('slow', () => T0 - 60_000);
    const heard = stamp('fast', T0);
    assert.equal(behind.hear(heard), true);
    const next = behind.tick();
    assert.ok(next.wall > heard.wall || (next.wall === heard.wall && next.count > heard.count));
  });
});

describe('temporal_replay_refused', () => {
  test('an edit sent again changes nothing', () => {
    const list = edits(0);
    const inbox = merged(list);
    const before = inbox.merged();
    for (const e of list) assert.equal(inbox.receive({ ...e }), 'replayed');
    // an old edit replayed after a newer one from the same device does not bring back the old version
    assert.equal(inbox.receive({ ...list[0] }), 'replayed');
    assert.deepEqual(inbox.merged(), before);
    assert.equal(inbox.all().length, 3);
  });

  test('a key taken away stops every edit signed with it from then on, whatever its stamp', () => {
    const [first, ben, later] = edits(0);
    const inbox = merged([first, ben]);
    inbox.revoke('ka');
    assert.equal(inbox.receive(later), 'revoked');
    assert.equal(
      inbox.receive({ ...later, seq: 9, stamp: stamp('ann', T0 - YEAR) }),
      'revoked',
      'a back-dated one too',
    );
    assert.deepEqual(
      inbox.latest().map((e) => `${e.device}#${e.seq}`),
      ['ann#1', 'ben#1'],
      'what was heard before the change stays',
    );
  });
});

const PERMISSIONS = (expires) => `// graph: permissions
(roger:Person {name: 'Roger', owner: TRUE}),
(ann:Person {name: 'Ann'}),
(editor:Role {name: 'Editor'}),
(rule:GrantRule {access: 'write', path: 'plan.md'}),
(editor)-[:HAS_RULE]->(rule),
(ann)-[:HAS_ROLE]->(editor),
(g:Grant {access: 'write', path: 'plan.md', status: 'asserted'${expires ? `, expires: '${expires}'` : ''}}),
(ann)-[:HOLDS]->(g),
(g)-[:FROM_RULE]->(rule)`;

function permissionsOf(text, now) {
  const store = new gs.Store();
  store.apply(text);
  return new Permissions(gs.worldFromStore(store).permissions, now);
}

describe('temporal_checked_at_use', () => {
  test('a shared link or token that has expired is refused when used, not only when made', () => {
    const link = { url: 'https://example.invalid/s/1', expires: '2026-10-28T12:00:00Z' };
    assert.deepEqual(atUse(link, '2026-10-28T11:59:59Z'), { ok: true });
    assert.deepEqual(atUse(link, '2026-10-28T12:00:00Z'), { ok: false, why: 'expired' });
    assert.deepEqual(atUse({ token: 't' }, '2030-01-01T00:00:00Z'), { ok: true }, 'one with no expiry works');
  });

  test('a grant that expires stops at its time, checked each time it is used', () => {
    let now = '2026-10-28T11:00:00Z';
    const p = permissionsOf(PERMISSIONS('2026-10-28T12:00:00Z'), () => now);
    const plan = { path: 'plan.md' };
    assert.deepEqual(p.check('ann', 'write', plan), { ok: true });
    now = '2026-10-28T12:00:01Z';
    assert.deepEqual(p.check('ann', 'write', plan), { ok: false, why: 'expired' });
    assert.deepEqual(p.check('roger', 'write', plan), { ok: true }, 'the owner always may');
  });

  test('a permission taken away between the ask and the write stops the write', () => {
    let current = permissionsOf(PERMISSIONS());
    const plan = { path: 'plan.md' };
    assert.ok(current.check('ann', 'write', plan).ok, 'she may when she asks');
    current = permissionsOf(PERMISSIONS().replace("status: 'asserted'", "status: 'withdrawn'"));
    let written = false;
    const answer = writeChecked(
      () => current,
      'ann',
      plan,
      () => (written = true),
    );
    assert.deepEqual(answer, { ok: false, why: 'not-asserted' });
    assert.equal(written, false);
  });

  test('a saved value made from an older source, or past its time, is refused', () => {
    const cached = { value: 42, source: 'sha:1', expires: '2026-10-28T12:00:00Z' };
    assert.deepEqual(useCached(cached, 'sha:1', '2026-10-28T11:00:00Z'), { ok: true, value: 42 });
    assert.deepEqual(useCached(cached, 'sha:2', '2026-10-28T11:00:00Z'), { ok: false, why: 'stale' });
    assert.deepEqual(useCached(cached, 'sha:1', '2026-10-28T13:00:00Z'), { ok: false, why: 'expired' });
  });
});
