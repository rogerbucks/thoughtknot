// Requirement: engine_version_watched (spec §13).
// OPS-5: the release does not fail on one slow answer from OSV or NVD. Each call is asked up to three times, and a
// recent committed cache stands in for a service that stays down. Proved with a fetch made for the purpose.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { refresh, refreshOrKeep, retrying } from '../scripts/engine-version.mjs';

const OSV = 'https://api.osv.dev/v1/query';
const NVD = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const ENGINE = { graphviz: '16.1.0', wrapper: '3.31.0' };
const noWait = async () => {};
/** A fetch that answers OSV with nothing and NVD with `nvd`. */
const services = (nvd) => async (url) => (String(url).startsWith(OSV) ? reply({}) : nvd);

describe('asking a service more than once', () => {
  test('a call that answers 503 once is asked again, after a pause that doubles, and at most three times', async () => {
    let calls = 0;
    const pauses = [];
    const flaky = retrying(
      async () => reply({}, ++calls < 2 ? 503 : 200),
      async (ms) => pauses.push(ms),
    );
    assert.equal((await flaky('x')).status, 200);
    assert.deepEqual([calls, pauses], [2, [1000]]);
    calls = -10;
    pauses.length = 0;
    assert.equal((await flaky('x')).status, 503, 'the third answer stands');
    assert.deepEqual([calls, pauses], [-7, [1000, 2000]]);
    const refused = retrying(
      async () => reply({}, 404),
      async (ms) => pauses.push(ms),
    );
    assert.equal((await refused('x')).status, 404, 'a refusal that will not change is not asked again');
  });

  test('a call that throws is asked again, and the third throw is the failure', async () => {
    let calls = 0;
    const offline = retrying(async () => {
      calls++;
      throw new Error('offline');
    }, noWait);
    await assert.rejects(offline('x'), /offline/);
    assert.equal(calls, 3);
  });
});

describe('a service that stays down', () => {
  const down = services(reply({}, 503));
  const committed = async () =>
    (await refresh({ ...ENGINE, fetch: services(reply({ vulnerabilities: [] })), sleep: noWait, today: '2026-10-10' }))
      .cache;
  const held = (when, previous) => refreshOrKeep({ ...ENGINE, fetch: down, sleep: noWait, today: when, previous });

  test('leaves a recent committed cache standing, with a warning', async () => {
    const previous = await committed();
    const kept = await held('2026-10-20', previous);
    assert.equal(kept.cache, previous);
    assert.equal(kept.changed, false);
    assert.match(kept.warning, /NVD answered 503.*checked 2026-10-10/s);
  });

  test('is a failure when the cache is over 14 days old, is for another engine, or is not there', async () => {
    const previous = await committed();
    await assert.rejects(held('2026-10-30', previous), /NVD answered 503/);
    const other = { ...previous, queried: { ...previous.queried, graphviz: '15.0.0' } };
    await assert.rejects(held('2026-10-20', other), /NVD answered 503/);
    await assert.rejects(held('2026-10-20', null), /NVD answered 503/);
  });
});
