// A layout shown as it improves (editor spec §68: layout_live_loop). Roger, 25 Oct 2026. A big drawing our own engine
// lays out comes first as a quick picture in rows, one pass over it. Its settled layout follows and glides in. While a
// person holds the drawing down, it waits until they let go, so nothing moves under their hand.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { loadEngine } from '../src/engine.ts';
import { LIVE_LEAST, LayoutRunner, inThreadPort, serveLayouts } from '../src/layout-worker.ts';
import { inReadingDirection } from '../src/drawing-direction.ts';
import { pickShownOf } from '../src/layouts/fingerprint.ts';
import { ViewState, startingSwitches } from '../src/view-switches.ts';
import { DEFAULT_SETTINGS } from '../src/settings.ts';
import { LiveHold } from '../src/display/graph-view/live-hold.ts';

const CLOCK = { setTimeout: (run, ms) => setTimeout(run, ms), clearTimeout: (t) => clearTimeout(t) };

/** A chain of `n` things, each linked to the next and every fifth back to the first: big enough to be live. */
function chain(n) {
  const things = Array.from({ length: n }, (_, i) => `(t${i}:Step)`);
  const links = Array.from({ length: n - 1 }, (_, i) => `(t${i})-[:NEXT]->(t${i + 1})`);
  const back = Array.from({ length: Math.floor(n / 5) }, (_, i) => `(t${i * 5 + 4})-[:BACK]->(t0)`);
  return readNote([`// graph: g\n${[...things, ...links, ...back].join(', ')}`]).graphs.get('g');
}
const own = (d, more = {}) => ({ ...d, engine: 'own', ...more });
const pickOf = (drawn) => pickShownOf(/data-layout-pick="([^"]*)"/.exec(drawn.svg)?.[1]);

/** What the worker says to `drawing`, in order, served on this thread. */
async function replies(drawing, theme) {
  const said = [];
  const port = inThreadPort((scope) => serveLayouts(scope, loadEngine));
  await new Promise((resolve) => {
    port.onmessage = ({ data }) => {
      if ('ready' in data) return port.postMessage({ id: 1, drawing, sourceBytes: 1e9, ...(theme ? { theme } : {}) });
      said.push(data);
      if ('drawn' in data || 'error' in data) resolve();
    };
  });
  port.terminate();
  return said;
}

describe('a big drawing shown as it improves (layout_live_loop)', () => {
  // proves: layout_live_loop
  test('comes first as a quick picture in rows, then as it settles', async () => {
    const said = await replies(own(chain(LIVE_LEAST), { live: true }));
    assert.deepEqual(
      said.map((r) => Object.keys(r).find((k) => k !== 'id')),
      ['early', 'drawn'],
    );
    assert.equal(pickOf(said[0].early)?.step, 'rows', 'the quick picture is the one pass in rows');
    assert.equal(pickOf(said[1].drawn)?.step, undefined, 'the settled one is laid out in full');
  });

  // proves: layout_live_loop
  test('a small one, one not live, or one for an export comes once, settled', async () => {
    const kinds = async (...args) => (await replies(...args)).map((r) => Object.keys(r).find((k) => k !== 'id'));
    assert.deepEqual(await kinds(own(chain(LIVE_LEAST - 1), { live: true })), ['drawn']);
    assert.deepEqual(await kinds(own(chain(LIVE_LEAST))), ['drawn']);
    assert.deepEqual(await kinds(own(chain(LIVE_LEAST), { live: true }), 'light'), ['drawn']);
  });

  // proves: layout_live_loop
  test('the runner gives the quick picture at once, its settled layout still coming', async () => {
    const r = new LayoutRunner({ page: () => inThreadPort((s) => serveLayouts(s, loadEngine)), clock: CLOCK });
    const first = await r.draw(own(chain(LIVE_LEAST), { live: true }), {});
    assert.equal(pickOf(first).step, 'rows');
    assert.ok(first.better instanceof Promise);
    const settled = await first.better;
    assert.equal(pickOf(settled).step, undefined);
    assert.equal(settled.better, undefined, 'settled, nothing more follows');
    r.close();
  });

  // proves: layout_live_loop
  test('a settled layout that fails, or is no longer wanted, leaves the quick picture', async () => {
    const port = { onerror: null, terminate: () => {}, postMessage: (m) => queueMicrotask(() => answer(m)) };
    let answer = () => {};
    Object.defineProperty(port, 'onmessage', {
      set: (f) => {
        answer = (m) => {
          f({ data: { id: m.id, early: { svg: '<svg/>', rankdir: 'LR', width: 1, height: 1 } } });
          f({ data: { id: m.id, error: 'boom' } });
        };
        queueMicrotask(() => f({ data: { ready: true } }));
      },
    });
    const r = new LayoutRunner({ worker: () => port, page: () => port, clock: CLOCK });
    const first = await r.draw(own(chain(3), { live: true }), {});
    assert.equal(await first.better, null);
    r.close();
  });

  // proves: layout_live_loop
  test('its settled layout is mirrored too, for a language read right to left', async () => {
    const svg = '<svg width="10" height="10"><g/></svg>';
    const settled = { svg, rankdir: 'LR', width: 10, height: 10 };
    const shown = inReadingDirection({ ...settled, better: Promise.resolve(settled) }, 'rtl');
    assert.equal((await shown.better).mirrored, true);
  });

  // proves: layout_live_loop
  test('each card laid out by our own engine is live', () => {
    assert.equal(new ViewState(startingSwitches(DEFAULT_SETTINGS)).folded(chain(3)).live, true);
    const graphviz = new ViewState({ ...startingSwitches(DEFAULT_SETTINGS), engine: false });
    assert.equal(graphviz.folded(chain(3)).live, undefined, 'Graphviz lays it out in one go');
  });
});

/** A card's viewport and its page, each keeping the listeners added to it, and a way to press and let go. */
function viewport() {
  const on = (bag) => ({
    addEventListener: (t, f) => (bag[t] ??= new Set()).add(f),
    removeEventListener: (t, f) => bag[t]?.delete(f),
  });
  const docBag = {},
    elBag = {};
  const el = { ...on(elBag), ownerDocument: on(docBag) };
  const fire = (bag, type, pointerId) => [...(bag[type] ?? [])].forEach((f) => f({ pointerId }));
  return {
    el,
    press: (id = 1) => fire(elBag, 'pointerdown', id),
    letGo: (id = 1, type = 'pointerup') => fire(docBag, type, id),
    heard: () => (docBag.pointerup?.size ?? 0) + (docBag.pointercancel?.size ?? 0),
  };
}

describe('while the drawing is held (layout_live_loop)', () => {
  const settled = { svg: '<svg/>', rankdir: 'LR', width: 1, height: 1 };
  const later = () => new Promise((r) => setTimeout(r, 0));

  // proves: layout_live_loop
  test('the settled layout waits until the person lets go, then goes in once', async () => {
    const v = viewport(),
      hold = new LiveHold(() => v.el),
      put = [];
    hold.follow({ ...settled, better: Promise.resolve(settled) }, (d) => put.push(d));
    v.press(1);
    v.press(2); // two fingers
    await later();
    assert.deepEqual(put, [], 'nothing moves under their hand');
    v.letGo(1);
    assert.deepEqual(put, [], 'one finger still holds it');
    v.letGo(2, 'pointercancel');
    assert.deepEqual(put, [settled]);
    assert.equal(v.heard(), 0, 'letting go is no longer listened for');
  });

  // proves: layout_live_loop
  test('with nothing held it goes in as it comes; one no longer wanted never does', async () => {
    const v = viewport(),
      hold = new LiveHold(() => v.el),
      put = [];
    hold.follow({ ...settled, better: Promise.resolve(settled) }, (d) => put.push(d));
    hold.follow({ ...settled, better: Promise.resolve(null) }, (d) => put.push(d));
    hold.follow(settled, (d) => put.push(d));
    await later();
    assert.deepEqual(put, [settled]);
  });
});
