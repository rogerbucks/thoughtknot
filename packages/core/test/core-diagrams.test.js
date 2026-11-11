// The built-in diagram types through the plug-in interface (editor spec §43, plugin_interface; §15). These prove each
// one registers as a plug-in's type does, holds to the same contract, and gives back drawing marks for a graph's shape.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PLUGIN_API, pluginRegistry } from '../src/plugins.ts';
import { diagramContract } from '../src/plugins-contract.ts';
import { CORE_DIAGRAMS_ID, coreDiagramType, coreDiagrams } from '../src/core-diagrams.ts';
import { drawMarksOf } from '../src/drawing-marks.ts';
import { loadEngine } from '../src/engine.ts';
import { DIAGRAM_TYPES } from '../src/style-graph.ts';
import { VIEW_TYPES } from '../src/view-types/view-types.ts';

const engine = await loadEngine();
const SPACE = { width: 400, height: 300 };
const thing = (key, kind = 'Person') => ({ key, text: key.toUpperCase(), kinds: [kind] });
/** A family tree: one parent of two, one of them parent of a third, and a team they sit in. */
const FAMILY = {
  things: [thing('ann'), thing('bob'), thing('cy'), thing('dee'), thing('lab', 'Team')],
  links: [
    { from: 'ann', type: 'PARENT_OF', to: 'bob' },
    { from: 'ann', type: 'PARENT_OF', to: 'cy' },
    { from: 'bob', type: 'PARENT_OF', to: 'dee' },
    { from: 'ann', type: 'PARENT_OF', to: 'lab' },
  ],
};
const registry = () => {
  const r = pluginRegistry({ timeLimit: Infinity });
  r.register(coreDiagrams(engine));
  return r;
};
const marksOf = async (type, shape = FAMILY, space = SPACE) => {
  const r = await registry().diagramMarks(coreDiagramType(type), shape, space);
  assert.ok(r.ok, r.message);
  return r.value;
};

describe('the built-in diagram types, through the plug-in interface (plugin_interface)', () => {
  test('each built-in type is added through it, under the core’s own id, with its title', () => {
    const r = registry();
    assert.deepEqual(r.plugins(), [CORE_DIAGRAMS_ID]);
    assert.deepEqual(
      r.diagramTypes().map((d) => [d.type, d.title]),
      [...DIAGRAM_TYPES, ...VIEW_TYPES].map((t) => [`thoughtknot.diagrams.${t}`, t[0].toUpperCase() + t.slice(1)]),
    );
  });

  // proves: view_types_offered
  test('with no engine, only the view types drawn as marks are added, and each still draws', async () => {
    const r = pluginRegistry({ timeLimit: Infinity });
    r.register(coreDiagrams());
    assert.deepEqual(
      r.diagramTypes().map((d) => d.type),
      VIEW_TYPES.map((v) => `thoughtknot.diagrams.${v}`),
    );
    const drawn = await r.drawDiagram('thoughtknot.diagrams.matrix', FAMILY, SPACE);
    assert.ok(drawn.ok, drawn.message);
    assert.match(drawn.value, /^<svg/);
  });

  test('each holds to the contract every plug-in’s diagram type is held to', async () => {
    for (const d of registry().diagramTypes())
      for (const check of diagramContract(d, CORE_DIAGRAMS_ID)) await check.run();
  });

  test('a tree gives drawing marks: a box for each thing and a link for each link, named by their keys', async () => {
    const marks = await marksOf('tree');
    assert.ok(Array.isArray(drawMarksOf(marks, SPACE)));
    const boxes = marks.filter((m) => m.kind === 'box' && m.role === 'thing').map((m) => m.of);
    assert.deepEqual(boxes.sort(), ['ann', 'bob', 'cy', 'dee', 'lab']);
    const links = marks.filter((m) => m.kind === 'link').map((m) => `${m.from}>${m.to}`);
    assert.deepEqual(links.sort(), ['ann>bob', 'ann>cy', 'ann>lab', 'bob>dee']);
    const y = (key) => marks.find((m) => m.kind === 'box' && m.of === key).y;
    assert.ok(y('ann') < y('bob') && y('bob') < y('dee'), 'a tree reads down, a parent above its children');
  });

  test('a type the graph does not fit is drawn as a network, never wrongly', async () => {
    const loop = { ...FAMILY, links: [...FAMILY.links, { from: 'dee', type: 'PARENT_OF', to: 'ann' }] };
    assert.deepEqual(await marksOf('flow', loop), await marksOf('network', loop));
    // in a tall space a network reads down to fit it; a flow still reads across
    const tall = { width: 300, height: 400 };
    assert.notDeepEqual(
      await marksOf('flow', FAMILY, tall),
      await marksOf('network', FAMILY, tall),
      'a flow it fits is drawn as a flow',
    );
  });

  test('marks are shrunk to fit a small space, and never grown to fill a large one', async () => {
    const small = await marksOf('network', FAMILY, { width: 60, height: 40 });
    assert.ok(Array.isArray(drawMarksOf(small, { width: 60, height: 40 })));
    const large = await marksOf('network', FAMILY, { width: 4000, height: 3000 });
    assert.deepEqual(large, await marksOf('network', FAMILY, { width: 5000, height: 5000 }));
  });

  test('a table is a row for each thing, its text then its kinds', async () => {
    const marks = await marksOf('table');
    assert.deepEqual(
      marks.filter((m) => m.kind === 'label').map((m) => m.text),
      ['ANN', 'Person', 'BOB', 'Person', 'CY', 'Person', 'DEE', 'Person', 'LAB', 'Team'],
    );
    assert.deepEqual(
      marks.filter((m) => m.kind === 'box').map((m) => m.style),
      ['kind.0', 'kind.0', 'kind.0', 'kind.0', 'kind.1'],
    );
  });

  test('drawn as SVG, the marks are coloured in the host’s theme, with no stand-in colour left', async () => {
    const r = await registry().drawDiagram(coreDiagramType('tree'), FAMILY, SPACE);
    assert.ok(r.ok, r.message);
    assert.match(r.value, /<svg /);
    assert.doesNotMatch(r.value, /#000[0-5][0-9a-f]{2}/);
    assert.match(r.value, />ANN</);
  });

  // proves: view_types_themed
  test('every type drawn as SVG paints its things in their kind’s colour, never black, in the drawing’s font', async () => {
    for (const d of registry().diagramTypes()) {
      const r = await registry().drawDiagram(d.type, FAMILY, SPACE);
      assert.ok(r.ok, `${d.type}: ${r.message}`);
      assert.doesNotMatch(r.value, /(?:fill|stroke)="(?:black|#000000)"/, `${d.type} paints something black`);
      assert.doesNotMatch(r.value, /Times/, `${d.type} writes its words in Times`);
      // Roger, 1 Nov 2026: "The backgrounds of the items are all black" (the Ego view)
      const things = r.value.match(/<g id="node\d+" class="node">[^]*?<\/g>/g) ?? [];
      for (const t of things)
        if (/<(?:ellipse|polygon|path)\b/.test(t))
          assert.match(t, /fill:rgba\(var\(--color-|fill="none"/, `${d.type}: a thing not in its kind’s colour: ${t}`);
    }
  });

  // proves: density_shaded
  test('the density view shades each square by how many things it holds, in the link colour', async () => {
    // a tight star of 40 round one hub, and a loose line of 20 off it, as the density view's own test has
    const star = Array.from({ length: 40 }, (_, i) => thing(`s${i}`));
    const line = Array.from({ length: 20 }, (_, i) => thing(`l${i}`));
    const links = [
      ...star.map((t) => ({ from: 'hub', type: 'KNOWS', to: t.key })),
      ...line.map((t, i) => ({ from: i ? `l${i - 1}` : 'hub', type: 'KNOWS', to: t.key })),
    ];
    const crowd = { things: [thing('hub'), ...star, ...line], links };
    const r = await registry().drawDiagram(coreDiagramType('density'), crowd, { width: 600, height: 400 });
    assert.ok(r.ok, r.message);
    const squares = r.value.match(/<polygon[^>]*class="thoughtknot-tile"[^>]*>/g) ?? [];
    assert.ok(squares.length > 1, `the squares are drawn as tiles: ${r.value.match(/<polygon[^>]*>/g)?.slice(0, 2)}`);
    assert.ok(
      squares.every((t) => !/fill="none"/.test(t)),
      'each is filled, not an outline',
    );
    const shades = new Set(squares.map((t) => /fill-opacity="([\d.]+)"/.exec(t)?.[1]));
    assert.ok(shades.size > 1, `squares differ in shade: ${[...shades]}`);
  });

  test('a region or a thing in a token the theme does not know is outlined, never filled over the things', async () => {
    const r = pluginRegistry({ timeLimit: Infinity });
    const region = { id: 'zone', style: 'ring.1', kind: 'group', x: 0, y: 0, width: 200, height: 200 };
    const box = { id: 'ann', of: 'ann', style: 'ring.0', kind: 'box', x: 10, y: 10, width: 40, height: 20 };
    const loose = { id: 'note', style: 'ring.2', kind: 'box', x: 60, y: 10, width: 40, height: 20 };
    r.register({
      id: 'acme.zones',
      version: '1.0.0',
      api: PLUGIN_API,
      uses: ['diagrams'],
      register: (points) =>
        points.diagrams?.add({ type: 'acme.zones.map', title: 'Zones', draw: () => [region, box, loose] }),
    });
    const drawn = await r.drawDiagram('acme.zones.map', FAMILY, SPACE);
    assert.ok(drawn.ok, drawn.message);
    assert.doesNotMatch(drawn.value, /(?:fill|stroke)="(?:black|#000000)"/);
    const shapes = drawn.value.match(/<(?:polygon|path|ellipse)\b[^>]*>/g) ?? [];
    assert.equal(shapes.filter((t) => /fill:rgba\(var\(--color-/.test(t)).length, 1, 'only the thing is filled');
  });
});
