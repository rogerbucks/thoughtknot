// Things stay put (editor spec §68, things_stay_put): layouts/kept-spots.ts. A card drawn again
// keeps each thing it showed where it was. That holds after a View menu switch, a filter or an edit to the note, by
// the same layout. A new layout the person asks for is laid out afresh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { loadEngine } from '../src/engine.ts';
import { LIVE_LEAST, LayoutRunner, inThreadPort, serveLayouts } from '../src/layout-worker.ts';
import { keptSpots, spotsHeard } from '../src/layouts/kept-spots.ts';
import { assertStaysPut, movedThings } from './stay-put-fixtures.js';

const CLOCK = { setTimeout: (run, ms) => setTimeout(run, ms), clearTimeout: (t) => clearTimeout(t) };

/** A small network: a hub, a ring and a few spokes, with `more` things linked to the hub; laid out by our engine. */
function network(more = 0) {
  const keys = ['hub', 'a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const extra = Array.from({ length: more }, (_, i) => `n${i}`);
  const things = [...keys, ...extra].map((k) => `(${k}:Thing)`);
  const links = [
    ...['a', 'b', 'c', 'd'].map((k) => `(hub)-[:HAS]->(${k})`),
    '(a)-[:NEXT]->(b)',
    '(b)-[:NEXT]->(e)',
    '(e)-[:NEXT]->(f)',
    '(f)-[:NEXT]->(g)',
    '(g)-[:NEXT]->(c)',
    ...extra.map((k) => `(hub)-[:HAS]->(${k})`),
  ];
  const d = readNote([`// graph: g\n${[...things, ...links].join(', ')}`]).graphs.get('g');
  return { ...d, engine: 'own' };
}
const spotsOf = (drawn) => spotsHeard(/data-layout-spots="([^"]*)"/.exec(drawn.svg)?.[1]);
/** Each thing's spot from the hub's, so a drawing shifted whole reads the same. */
const fromHub = (spots) => {
  const [hx, hy] = spots.get('hub') ?? [0, 0];
  return new Map([...spots].map(([k, [x, y]]) => [k, [x - hx, y - hy]]));
};
const runner = () => new LayoutRunner({ page: () => inThreadPort((s) => serveLayouts(s, loadEngine)), clock: CLOCK });

// proves: things_stay_put
test('a card drawn again with a thing more keeps every thing it showed where it was', async () => {
  const r = runner(),
    card = {};
  const first = spotsOf(await r.draw(network(), card));
  assert.ok(first.size >= 8, 'our engine says where it put each thing');
  const fresh = spotsOf(await r.draw(network(3), {}));
  assert.ok(movedThings(first, fresh).length > 0, 'laid out afresh, the new things move the old ones');
  const again = spotsOf(await r.draw(network(3), card));
  // the drawing may grow round a link bowed past its edge: the view keeps the person's place (layout_glide)
  assertStaysPut(fromHub(first), fromHub(again), 'the same card, three things added');
  assert.ok(
    ['n0', 'n1', 'n2'].every((k) => again.has(k)),
    'and the new ones are drawn',
  );
  r.close();
});

// proves: things_stay_put
test('a layout the person asks for is laid out afresh, not kept', async () => {
  const r = runner(),
    card = {};
  const first = spotsOf(await r.draw(network(), card));
  const spaced = spotsOf(await r.draw({ ...network(), layoutOptions: { spacing: 2 } }, card));
  assert.ok(movedThings(first, spaced).length > 0, 'more spacing, asked for, moves things apart');
  r.close();
});

test('a new thing keeps its fresh place beside a neighbour that was kept', () => {
  const fresh = new Map([
    ['a', [10, 10]],
    ['b', [50, 10]],
    ['new', [50, 40]],
  ]);
  const kept = new Map([
    ['a', [100, 100]],
    ['b', [140, 100]],
  ]);
  const out = keptSpots(fresh, kept, [{ from: 'b', to: 'new' }]);
  assert.deepEqual(out.get('new'), [140, 130], '30 below b, as the fresh layout put it');
  assert.deepEqual(out.get('a'), [100, 100]);
});

// proves: things_stay_put
test('a big live drawing drawn again with its spots kept comes once, with no quick picture first', async () => {
  const r = runner(),
    card = {};
  const big = (more) => ({ ...network(more), live: true });
  const first = await r.draw(big(LIVE_LEAST), card);
  await first.better;
  const again = await r.draw(big(LIVE_LEAST + 1), card);
  assert.equal(again.better, undefined, 'nothing to settle: every thing it showed stays where it was');
  r.close();
});
