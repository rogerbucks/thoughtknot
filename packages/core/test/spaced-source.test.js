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
