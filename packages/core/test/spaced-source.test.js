// The View menu's spacing in a drawing Graphviz lays out (editor spec §68, view_options_everywhere): spaced-source.ts.
// Roger, 2 Nov 2026: options must work the same in every view. Spacing and link length moved only a plain network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readNote } from '../src/drawing.ts';
import { directions } from '../src/render.ts';
import { readStyle } from '../src/style.ts';
import { styledDrawing } from '../src/style-source.ts';
import { spacedSource } from '../src/spaced-source.ts';

const DOT =
  'digraph {\n  graph [rankdir=TB, ranksep=0.5, nodesep=0.25, bgcolor="transparent", pad=0.1];\n  "a" -> "b";\n}';

// proves: view_options_everywhere
test('spacing widens the room across and between ranks; link length only between them', () => {
  assert.match(spacedSource(DOT, { spacing: 2 }), /ranksep=1, nodesep=0.5,/);
  assert.match(spacedSource(DOT, { linkLength: 3 }), /ranksep=1.5, nodesep=0.25,/);
  assert.match(spacedSource(DOT, { spacing: 2, linkLength: 0.5 }), /ranksep=0.5, nodesep=0.5,/);
  assert.equal(spacedSource(DOT, {}), DOT, 'as laid out by default, byte for byte');
  assert.equal(spacedSource(DOT), DOT);
});

// proves: view_options_everywhere
test('a tree, flow, lanes, radial and timeline take the View menu’s spacing', () => {
  const texts = [
    "// graph: org\n(a:P {name: 'A'}),\n(b:P {name: 'B'}),\n(c:P {name: 'C'}),\n(a)-[:M]->(b),\n(a)-[:M]->(c)",
  ];
  const reading = readNote(texts);
  for (const type of ['tree', 'flow', 'lanes', 'radial', 'timeline']) {
    const style = readStyle(
      [...texts, `// graph: org_style · STYLE org\n(d:Diagram {type: '${type}'})`],
      'org',
      reading,
    ).style;
    const drawing = styledDrawing(reading.graphs.get('org'), style, reading.world.org);
    const sep = (d) => Number(/nodesep=([0-9.]+)/.exec(directions(d)[0].dot)?.[1]);
    assert.ok(sep({ ...drawing, layoutOptions: { spacing: 2 } }) > sep(drawing), type);
  }
});

// proves: view_options_everywhere
test('a tree, flow and lanes run the way the View menu’s Direction picks, as Graphviz lays them out', () => {
  const texts = ["// graph: org\n(a:P {name: 'A'}),\n(b:P {name: 'B'}),\n(a)-[:M]->(b)"];
  const reading = readNote(texts);
  for (const type of ['tree', 'flow', 'lanes']) {
    const style = readStyle(
      [...texts, `// graph: org_style · STYLE org\n(d:Diagram {type: '${type}'})`],
      'org',
      reading,
    );
    const drawing = styledDrawing(reading.graphs.get('org'), style.style, reading.world.org);
    for (const direction of ['LR', 'TB']) {
      // the View menu writes the direction it picks on the drawing (view-switches.ts)
      const laid = directions({ ...drawing, direction });
      assert.deepEqual(
        laid.map((d) => /rankdir=(\w+)/.exec(d.dot)?.[1]),
        [direction],
        `${type} runs ${direction}`,
      );
    }
  }
});

// requirement, then tests, then code: kinds that link in order
const ORDERED = [
  "// graph: org\n(r:Req {name: 'R'}),\n(t:Test {name: 'T'}),\n(t2:Test {name: 'T2'}),\n(c:Code {name: 'C'}),\n(c2:Code {name: 'C2'}),\n(r)-[:M]->(t),\n(r)-[:M]->(t2),\n(t)-[:M]->(c),\n(t2)-[:M]->(c2)",
];
/** The org graph drawn as the diagram type `type`. */
const drawnAs = (type) => {
  const reading = readNote(ORDERED);
  const texts = [...ORDERED, `// graph: org_style · STYLE org\n(d:Diagram {type: '${type}'})`];
  return styledDrawing(reading.graphs.get('org'), readStyle(texts, 'org', reading).style, reading.world.org);
};
const columns = (d) => (directions(d)[0].dot.match(/^ {2}\{ rank=same; /gm) ?? []).length;

// proves: view_options_everywhere
test('rounds and a wider or taller shape are written for Graphviz', () => {
  assert.match(spacedSource(DOT, { rounds: 2 }), /pad=0.1, mclimit=2\];/);
  assert.match(spacedSource(DOT, { shape: 'wide' }), /pad=0.1, ratio=0.5\];/);
  assert.match(spacedSource(DOT, { shape: 'tall', rounds: 0.5 }), /pad=0.1, mclimit=0.5, ratio=2\];/);
  assert.equal(spacedSource(DOT, { rounds: 1, shape: 'screen' }), DOT);
});

// proves: view_options_everywhere
test('a network Graphviz lays out keeps each kind in a column of its own with lanes on, and none with lanes off', () => {
  const reading = readNote(ORDERED);
  const d = reading.graphs.get('org');
  assert.equal(columns(d), 2, 'the tests in one column, the code in another');
  assert.equal(columns({ ...d, kindLanes: false }), 0);
});

// proves: view_options_everywhere
test('a tree, flow and lanes are laid out by the layout the View menu chose; by Graphviz on Auto', () => {
  for (const type of ['tree', 'flow', 'lanes']) {
    const d = drawnAs(type);
    assert.equal(d.diagram?.type, type);
    assert.ok(!directions(d)[0].own, `${type} on Auto: Graphviz`);
    for (const strategy of ['rows', 'spread'])
      assert.ok(directions({ ...d, layoutOptions: { strategy } })[0].own, `${type} in ${strategy}`);
  }
});
