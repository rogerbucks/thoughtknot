// The drawings over a graph in an exported image (editor spec §70, sketch_reader_picture). A reader of the file sees
// them with no plug-in, as the card draws them. They are pinned to their things, in the export's fixed colours. Each
// is said in its title. A graph with no drawings exports as it did. Spans export.ts and sketch-marks.ts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from '../src/engine.ts';
import { readNote } from '../src/drawing.ts';
import { exportSvg } from '../src/export.ts';
import { exportScope } from '../src/export-scope.ts';
import { PALETTES } from '../src/palette.ts';
import { readSketch } from '../src/sketch.ts';
import { withSketchSvg } from '../src/sketch-marks.ts';

const engine = await loadEngine();
const TEAM = [
  `// graph: team
(ann:Person {name: 'Ann'}),
(bob:Person {name: 'Bob'}),
(ann)-[:ASKS]->(bob)`,
];
const SKETCH = readSketch(`// graph: team_ink · SKETCH ON team
(d1:Ink {x: 0, y: 0, pin: 'ann', points: '0 0 30 10'}),
(d2:Shape {x: 0, y: 0, pin: 'bob', shape: 'ellipse'}),
(d3:Text {x: 5, y: 5, text: 'Ask Bob first'})`).sketch;
const INFO = { note: 'Team.md', date: '2026-10-29', theme: 'light' };
const reading = readNote(TEAM);
const scope = exportScope(reading, { graph: 'team' });

describe('the drawings in an exported image', () => {
  // proves: sketch_reader_picture
  test('are drawn on top of the graph, each with what it is, in the fixed colours of the export', () => {
    const { svg } = exportSvg(scope, engine, { ...INFO, sketch: SKETCH });
    const layer = svg.slice(svg.indexOf('class="tk-sketch"'));
    assert.ok(svg.includes('class="tk-sketch"'), 'the drawings are in the file');
    for (const id of ['d1', 'd2', 'd3']) assert.ok(layer.includes(`data-sketch="${id}"`), `drawing ${id}`);
    assert.match(layer, /<polyline /, 'the stroke');
    assert.match(layer, /<ellipse /, 'the ellipse round Bob');
    assert.match(layer, />Ask Bob first</, 'the note');
    assert.match(layer, /<title>[^<]*pinned to Ann</, 'each said with the thing it is pinned to, by name');
    assert.ok(layer.includes(PALETTES.light.text), 'in the light theme’s fixed ink');
    assert.doesNotMatch(layer, /var\(--/, 'no theme variable a reader outside Obsidian could not read');
    assert.ok(svg.indexOf('class="tk-sketch"') > svg.indexOf('class="node"'), 'on top of the things');
  });

  // proves: sketch_reader_picture
  test('in the dark theme are in its own ink', () => {
    const { svg } = exportSvg(scope, engine, { ...INFO, theme: 'dark', sketch: SKETCH });
    assert.ok(svg.slice(svg.indexOf('class="tk-sketch"')).includes(PALETTES.dark.text));
  });

  // proves: sketch_reader_picture
  test('none, or none to draw, leaves the image as it was', () => {
    const plain = exportSvg(scope, engine, INFO).svg;
    assert.equal(exportSvg(scope, engine, { ...INFO, sketch: null }).svg, plain);
    assert.equal(exportSvg(scope, engine, { ...INFO, sketch: { ...SKETCH, items: [] } }).svg, plain);
    assert.equal(withSketchSvg('<svg></svg>', SKETCH, [], PALETTES.light).includes('tk-sketch'), true, 'a note alone');
  });
});
