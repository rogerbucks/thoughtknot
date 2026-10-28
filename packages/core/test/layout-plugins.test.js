// Layouts a plug-in adds, and the layout a person chooses (editor spec §68: layout_plugins). Roger, 25 Oct 2026: layouts
// are plug-and-play. A plug-in adds a layout under its own id; the View menu offers it beside rows and spread out. It is
// placed on the page, its spots go to the layout worker as data, and our engine draws it. In 2.5D and 3D each thing
// keeps its place across and down. A layout that throws or gives bad spots is named, and the shape picks instead.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PLUGIN_API, pluginRegistry } from '../src/plugins.ts';
import { layoutContract } from '../src/plugins-contract.ts';
import { ownSpots } from '../src/layouts/own-engine.ts';
import { ownLaid, ownSource, placedIn } from '../src/layouts/own-draw.ts';
import { pickSaid } from '../src/layouts/fingerprint.ts';
import { layoutOptions } from '../src/layouts/layout-options.ts';
import { drawingShape, offerLayouts, offerOf, offeredLayouts, placedFor } from '../src/layouts/offered.ts';
import { spreadSpace } from '../src/space-spread.ts';
import { LayoutRunner } from '../src/layout-worker.ts';
import { readStyle } from '../src/style.ts';
import { readNote } from '../src/drawing.ts';
import { startingLayout } from '../src/view-switches.ts';

const box = (of) => ({ kind: 'box', id: of, style: 'thing', role: 'thing', of, x: 0, y: 0, width: 100, height: 40 });
const link = ([from, to]) => ({ kind: 'link', id: `${from} ${to}`, style: 'link', from, to, points: [] });
// a ring of six, and one spoke: a network the shape would spread out
const LINKS = [
  ['a', 'b'],
  ['b', 'c'],
  ['c', 'd'],
  ['d', 'e'],
  ['e', 'f'],
  ['f', 'a'],
  ['a', 'd'],
];
const KEYS = [...new Set(LINKS.flat())];
const LAID = { marks: [...KEYS.map(box), ...LINKS.map(link)], space: { width: 0, height: 0 } };
const SHAPE = {
  things: KEYS.map((key) => ({ key, text: key, kinds: [] })),
  links: LINKS.map(([from, to]) => ({ from, type: 'TO', to })),
};

/** Things in a line across, each one unit on: an order no layout of ours would give a ring. */
const inLine = {
  id: 'acme.shapes.line',
  title: 'In a line',
  dims: 2,
  place: ({ shape }) => Object.fromEntries(shape.things.map((t, i) => [t.key, [i, 0]])),
};
const registered = (layout = inLine, over = {}) => {
  const registry = pluginRegistry({ timeLimit: Infinity });
  registry.register({
    id: 'acme.shapes',
    version: '1.0.0',
    api: PLUGIN_API,
    uses: ['layouts'],
    register: (points) => points.layouts.add(layout),
    ...over,
  });
  return registry;
};
const given = (shape = SHAPE) => ({ shape, previous: {}, options: layoutOptions(), sizes: {} });

afterEach(() => offerLayouts(null));

describe('a layout a plug-in adds (layout_plugins)', () => {
  // proves: layout_plugins
  test('is added under its plug-in’s id, in two dimensions, with a title, and listed', () => {
    assert.deepEqual(
      registered()
        .layouts()
        .map((l) => [l.id, l.title, l.dims]),
      [['acme.shapes.line', 'In a line', 2]],
    );
    for (const id of ['line', 'other.shapes.line', 'acme.shapes.Line', 'acme.shapes'])
      assert.throws(() => registered({ ...inLine, id }), /is not named acme\.shapes\.<word>/, id);
    assert.throws(() => registered({ ...inLine, dims: 3 }), /two dimensions/);
    assert.throws(() => registered({ ...inLine, title: ' ' }), /no title on one line/);
    assert.throws(() => registered(inLine, { uses: ['diagrams'] }), /cannot|not|names/);
  });

  // proves: layout_plugins
  test('places every thing it is given once, and spots that are wrong or a layout that throws are named', async () => {
    const r = await registered().placeBy('acme.shapes.line', given());
    assert.ok(r.ok);
    assert.deepEqual(Object.keys(r.value), KEYS);
    const wrong = async (place) => {
      const out = await registered({ ...inLine, place }).placeBy('acme.shapes.line', given());
      assert.equal(out.ok, false);
      assert.equal(out.plugin, 'acme.shapes');
      return out.message;
    };
    assert.match(await wrong(() => ({ a: [0, 0] })), /gave no spot to "b"/);
    assert.match(await wrong(({ shape }) => ({ ...inLine.place({ shape }), z: [0, 0] })), /"z", which it was not/);
    assert.match(await wrong(({ shape }) => ({ ...inLine.place({ shape }), a: [NaN, 0] })), /"a" is not two numbers/);
    assert.match(await wrong(() => new Map(KEYS.map((k) => [k, [0]]))), /is not two numbers/);
    assert.match(await wrong(() => { throw new Error('boom'); }), /boom/); // prettier-ignore
    assert.match(await wrong(() => 'spots'), /no spots/);
  });

  // proves: layout_plugins
  test('is given frozen copies, so it cannot change the graph', async () => {
    let got;
    await registered({ ...inLine, place: (g) => ((got = g), inLine.place(g)) }).placeBy('acme.shapes.line', given());
    assert.ok(Object.isFrozen(got) && Object.isFrozen(got.shape.things[0]) && Object.isFrozen(got.options));
    assert.notEqual(got.shape, SHAPE);
  });

  // proves: layout_plugins
  test('meets its contract suite, and one that is not the same each time fails it', async () => {
    for (const check of layoutContract(inLine, 'acme.shapes')) await check.run();
    let n = 0;
    const shaky = { ...inLine, place: ({ shape }) => Object.fromEntries(shape.things.map((t) => [t.key, [n++, 0]])) };
    const results = await Promise.allSettled(layoutContract(shaky, 'acme.shapes').map((c) => c.run()));
    assert.equal(results.filter((x) => x.status === 'rejected').length, 1);
  });
});

describe('the layout a person chooses (layout_plugins)', () => {
  // proves: layout_plugins
  test('a plug-in’s spots lay the drawing out in their order, scaled to the drawing, and the pick says so', () => {
    const placed = new Map(KEYS.map((k, i) => [k, [i, 0]]));
    const options = { strategy: 'acme.shapes.line' };
    const { spots, pick } = ownSpots(LAID, 'LR', undefined, [], options, undefined, undefined, placed);
    assert.deepEqual(pick, { layout: 'given', why: 'chosen' });
    const xs = KEYS.map((k) => spots.get(k)[0]);
    assert.deepEqual(
      xs,
      [...xs].sort((p, q) => p - q),
      'left to right as given',
    );
    for (const p of KEYS)
      for (const q of KEYS) {
        const [[px, py], [qx, qy]] = [spots.get(p), spots.get(q)];
        if (p < q) assert.ok(Math.abs(px - qx) >= 100 || Math.abs(py - qy) >= 40, `${p} and ${q} do not overlap`);
      }
    offerLayouts(offerOf(() => [registered()]));
    const { shown } = ownLaid(LAID, 'LR', [], options, new Map(), true, undefined, placed);
    assert.equal(shown.chosen, 'acme.shapes.line');
    assert.match(pickSaid(shown), /Laid out as you chose: In a line\./);
  });

  // proves: layout_plugins
  test('a layout that placed nothing falls back to the shape’s pick, saying the chosen one could not lay it out', () => {
    const options = { strategy: 'acme.shapes.line' };
    const { shown, marks } = ownLaid(LAID, 'LR', [], options, new Map(), true, undefined, new Map());
    assert.equal(shown.missed, true);
    assert.notEqual(shown.why, 'chosen');
    assert.ok(
      marks.marks.some((m) => m.kind === 'box'),
      'never blank',
    );
    assert.match(pickSaid(shown), /^acme\.shapes\.line could not lay this graph out/);
  });

  // proves: layout_plugins
  test('rows or spread out is used as chosen, whatever the shape would pick', () => {
    assert.equal(ownSpots(LAID, 'LR').pick.layout, 'stress');
    assert.deepEqual(ownSpots(LAID, 'LR', undefined, [], { strategy: 'rows' }).pick, {
      layout: 'layered',
      why: 'chosen',
    });
    const tree = { marks: [...['r', 's', 't'].map(box), link(['r', 's']), link(['r', 't'])], space: LAID.space };
    assert.equal(ownSpots(tree, 'LR').pick.layout, 'layered');
    assert.equal(ownSpots(tree, 'LR', undefined, [], { strategy: 'spread' }).pick.layout, 'stress');
  });

  // proves: layout_plugins
  test('the spots travel in the layout source, so the worker lays out by them', () => {
    const dot = 'digraph G {\n  a [label="a"];\n  b [label="b"];\n  a -> b;\n}';
    const src = ownSource(dot, { strategy: 'acme.shapes.line' }, new Map(), true, undefined, { a: [0, 0], b: [1, 0] });
    assert.deepEqual(Object.fromEntries(placedIn(src)), { a: [0, 0], b: [1, 0] });
    assert.equal(placedIn(ownSource(dot)).size, 0);
  });

  // proves: layout_plugins
  test('is placed on the page before the drawing goes to the worker; one not offered goes with no spots', async () => {
    const block = '// graph: g\n(a:T), (b:T), (c:T), (a)-[:TO]->(b), (b)-[:TO]->(c)';
    const drawing = { ...readNote([block]).graphs.get('g'), layoutOptions: { strategy: 'acme.shapes.line' } };
    assert.deepEqual(
      drawingShape(drawing).things.map((t) => t.key),
      ['a', 'b', 'c'],
    );
    assert.deepEqual((await placedFor(drawing)).placed, {}, 'none offered');
    offerLayouts(offerOf(() => [registered()]));
    assert.deepEqual(offeredLayouts(), [{ id: 'acme.shapes.line', title: 'In a line' }]);
    const posted = [];
    const port = { onerror: null, postMessage: (m) => posted.push(m), terminate: () => {} };
    let handler = null;
    Object.defineProperty(port, 'onmessage', {
      get: () => handler,
      set: (f) => ((handler = f), setTimeout(() => handler?.({ data: { ready: true } }), 0)),
    });
    const clock = { setTimeout: (run, ms) => setTimeout(run, ms), clearTimeout: (t) => clearTimeout(t) };
    const runner = new LayoutRunner({ worker: () => port, page: () => port, clock, told: () => {} });
    void runner.draw(drawing, {});
    for (let i = 0; i < 50 && !posted.length; i++) await new Promise((r) => setTimeout(r, 5));
    runner.close();
    assert.deepEqual(posted[0].drawing.placed, { a: [0, 0], b: [1, 0], c: [2, 0] });
  });

  // proves: layout_plugins
  test('in 3D each thing keeps its place across and down, as in the flat drawing', () => {
    const marks = KEYS.map((k, i) => ({ ...box(k), x: i * 200, y: 0 }));
    const all = [...marks, ...LINKS.map(link)];
    const across = (layout) => {
      const { space } = spreadSpace(all, undefined, false, false, layout);
      const xs = new Map(space.blocks.map((b) => [b.of, b.x]));
      return KEYS.map((k) => xs.get(k));
    };
    const chosen = across({ strategy: 'acme.shapes.line' });
    assert.deepEqual(chosen, [...chosen].sort((p, q) => p - q), 'in a line, as drawn'); // prettier-ignore
    const picked = across({});
    assert.notDeepEqual(
      picked,
      [...picked].sort((p, q) => p - q),
      'laid out afresh by the shape',
    );
  });

  // proves: layout_plugins
  test('is saved in the style graph by its id, and a word that is neither ours nor a plug-in’s is a problem', () => {
    const texts = (strategy) => [
      '// graph: trip · SOURCE\n(home:Place), (park:Place), (home)-[:NEAR]->(park)',
      `// graph: trip_style · STYLE trip\n(w1:Shown {view: 'near', layout_strategy: '${strategy}'})`,
    ];
    const styled = (strategy) => readStyle(texts(strategy), 'trip', readNote(texts(strategy)));
    for (const strategy of ['rows', 'spread', 'auto', 'acme.shapes.line']) {
      const { style, problems } = styled(strategy);
      assert.deepEqual(problems, [], strategy);
      assert.equal(startingLayout(style, 'near').strategy, strategy);
    }
    assert.match(styled('banana').problems[0]?.message ?? '', /layout_strategy must be auto, rows or spread/);
  });
});
