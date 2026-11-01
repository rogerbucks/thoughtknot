// Direct links drawn alike by both libraries (editor spec §25, untangle_direct; §43, plugin_interface). Each case is
// laid out once, as JSON. The core reads it as marks, draws its links direct and writes the SVG (direct-links.ts,
// graphviz-svg.ts). The Python library does the same (graphspec/style/direct_links.py, marks_svg.py). Both write the
// same SVG, byte for byte. The cases are shared with python/graph_spec/tests/test_direct_links.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { instance } from '@viz-js/viz';
import { directLinks } from '../src/direct-links.ts';
import { layoutMarks } from '../src/graphviz-marks.ts';
import { layoutSvg } from '../src/graphviz-svg.ts';

const cases = (name) =>
  JSON.parse(readFileSync(new URL(`../../../python/graph_spec/tests/${name}`, import.meta.url), 'utf8')).cases;
const DIRECT = cases('direct_cases.json'),
  MARKS = cases('marks_cases.json'),
  ROWS = cases('rows_cases.json');
const PY_SRC = fileURLToPath(new URL('../../../python/graph_spec/src', import.meta.url));
const PYTHON = `
import json, sys
sys.path.insert(0, ${JSON.stringify(PY_SRC)})
from graphspec.style.direct_links import direct_links
from graphspec.style.marks import layout_marks
from graphspec.style.marks_svg import layout_svg
asked = json.load(sys.stdin)
def drawn(g, direct, way):
    if not direct:
        return layout_marks(g)
    return direct_links(layout_marks(g), way, True) if way else direct_links(layout_marks(g))
print(json.dumps([layout_svg(drawn(g, direct, way)) for g, direct, way in asked]))
`;

/**
 * The SVG each library writes for `layouts`, drawn direct or as laid out: the core's, then the Python library's.
 * Given the way, `LR` or `TB`, each is routed on its rows (links_routed_in_rows).
 */
function both(layouts, direct, way) {
  const r = spawnSync('python3', ['-c', PYTHON], {
    input: JSON.stringify(layouts.map((g) => [g, direct, way ?? null])),
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  const drawn = (g) =>
    way ? directLinks(layoutMarks(g), undefined, undefined, way, true) : directLinks(layoutMarks(g));
  const core = layouts.map((g) => layoutSvg(direct ? drawn(g) : layoutMarks(g)));
  return [core, JSON.parse(r.stdout)];
}

/** The first line where `a` and `b` differ, or null where they are the same. */
function firstApart(a, b) {
  const x = a.split('\n'),
    y = b.split('\n');
  const i = x.findIndex((line, k) => line !== y[k]);
  return i < 0 && x.length === y.length ? null : `line ${i + 1}: ${x[i]} | ${y[i]}`;
}

test('both libraries draw the same links direct, with the same SVG', async () => {
  const viz = await instance();
  const layouts = [...DIRECT, ...MARKS].map((c) => viz.renderJSON(c.dot));
  const [core, python] = both(layouts, true);
  [...DIRECT, ...MARKS].forEach((c, i) => assert.equal(firstApart(core[i], python[i]), null, c.name));
  assert.ok(
    DIRECT.every((_, i) => core[i] !== layoutSvg(layoutMarks(layouts[i]))),
    'each drawing is drawn again',
  );
});

test('both libraries write the same SVG from the same layout', async () => {
  const viz = await instance();
  const layouts = MARKS.map((c) => viz.renderJSON(c.dot));
  const [core, python] = both(layouts, false);
  MARKS.forEach((c, i) => assert.equal(firstApart(core[i], python[i]), null, c.name));
});

test('both libraries route links on the rows Graphviz laid out alike, with the same SVG', async () => {
  // links_routed_in_rows: past 300 things each link passes between the boxes, through a gap in each row it crosses
  const viz = await instance();
  const rowed = [...DIRECT, ...MARKS, ...ROWS].map((c) => viz.renderJSON(c.dot));
  for (const way of ['LR', 'TB']) {
    const [core, python] = both(rowed, true, way);
    [...DIRECT, ...MARKS, ...ROWS].forEach((c, i) =>
      assert.equal(firstApart(core[i], python[i]), null, `${c.name} ${way}`),
    );
  }
  // each laid out its own way is routed, not drawn direct
  ROWS.forEach((c) => {
    const g = [viz.renderJSON(c.dot)];
    const way = /rankdir=TB/.test(c.dot) ? 'TB' : 'LR';
    assert.notEqual(both(g, true, way)[0][0], both(g, true)[0][0], c.name);
  });
});
