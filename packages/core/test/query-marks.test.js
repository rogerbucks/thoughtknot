// The one mark rule for a highlight (editor spec ES§75, ai_query_highlight): query-marks.ts. Every painter reads it. It
// says which things are marked, with which badge and colour, and adds the marks beside each thing's own. Nothing is
// placed or sized anew. The colours keep the locked contrast in the light and the dark theme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUERY_MARKS } from '../src/filter.ts';
import {
  QUERY_RINGS,
  badged,
  drawnOf,
  markedBy,
  markedShown,
  queryLabel,
  queryLine,
  queryPaint,
  withQueryMarks,
  withQueryPaints,
} from '../src/query-marks.ts';
import { PALETTES } from '../src/palette.ts';
import { DARK, LIGHT, contrast } from '../src/render/render-look.ts';
import { Untangle } from '../src/untangle.ts';

const [FLAG, STAR] = QUERY_MARKS;
const MARKS = [
  { id: 'b:roof', kind: 'box', style: 'thing', of: 'roof', x: 10, y: 20, width: 40, height: 16, shape: 'round' },
  {
    id: 'l:roof',
    kind: 'label',
    style: 'thing.name',
    of: 'roof',
    x: 30,
    y: 30,
    text: 'Roof',
    size: 12,
    anchor: 'middle',
  },
  { id: 'b:sam', kind: 'box', style: 'thing', of: 'sam', x: 80, y: 20, width: 40, height: 16 },
  {
    id: 'l:sam',
    kind: 'label',
    style: 'thing.name',
    of: 'sam',
    x: 100,
    y: 30,
    text: 'Sam',
    size: 12,
    anchor: 'middle',
  },
];

// proves: ai_query_highlight
test('ai_query_highlight: the rule says which things are marked, with each part’s badge, in the first part’s colour', () => {
  const marked = markedBy(['roof', 'walls'], FLAG);
  assert.deepEqual([...marked.keys()], ['roof', 'walls']);
  assert.deepEqual([...markedShown(marked, new Set(['walls'])).keys()], ['roof'], 'a hidden thing carries no mark');
  assert.deepEqual(drawnOf([FLAG]), { glyph: '⚑', hue: 'blue', token: 'query.blue' });
  assert.deepEqual(drawnOf([STAR, FLAG, STAR]), { glyph: '★⚑', hue: 'orange', token: 'query.orange' });
  assert.equal(drawnOf(undefined), null);
  assert.equal(drawnOf([]), null);
  assert.equal(badged('Roof', drawnOf([FLAG])), '⚑ Roof');
  assert.equal(badged('Roof', null), 'Roof');
});

// proves: ai_query_highlight
test('ai_query_highlight: plain marks get a ring in the colour and the badge before the name, and nothing moves', () => {
  const before = structuredClone(MARKS);
  const out = withQueryMarks(MARKS, markedBy(['roof'], FLAG));
  assert.deepEqual(MARKS, before, 'the marks given are untouched');
  for (const m of before) {
    const { text: _now, ...now } = out.find((o) => o.id === m.id);
    const { text: _was, ...was } = m;
    assert.deepEqual(now, was, `${m.id} keeps its place, size and style`);
  }
  assert.equal(out.find((m) => m.id === 'l:roof').text, '⚑ Roof', 'the badge');
  assert.equal(out.find((m) => m.id === 'l:sam').text, 'Sam', 'a thing not found is as it was');
  const rings = out.filter((m) => m.id.startsWith('q'));
  assert.equal(rings.length, QUERY_RINGS.length);
  for (const r of rings) {
    assert.equal(r.style, 'query.blue', 'the colour');
    assert.equal(r.shape, 'round', 'the ring follows the outline');
    assert.ok(r.x < 10 && r.y < 20 && r.width > 40 && r.height > 16, 'the ring lies outside the box');
  }
  // each ring follows its box: the box's own mark comes first, so it is painted underneath
  assert.ok(out.findIndex((m) => m.id === 'b:roof') < out.findIndex((m) => m.style === 'query.blue'));
  assert.deepEqual(withQueryMarks(MARKS, new Map()), MARKS, 'no highlight, no change');
});

// proves: ai_query_highlight
test('ai_query_highlight: a highlight’s token is painted in a line and text of its hue, never a fill', () => {
  const p = PALETTES.light;
  assert.deepEqual(queryPaint('query.green', p), { line: queryLine('green', p), text: queryLabel('green', p) });
  assert.equal(queryPaint('thing', p), null);
  const paints = withQueryPaints((s) => ({ fill: `fill of ${s}` }), p);
  assert.deepEqual(paints('thing'), { fill: 'fill of thing' }, 'every other token as before');
  assert.equal(paints('query.red').fill, undefined, 'a ring hides nothing under it');
});

// proves: ai_query_highlight
for (const [name, p, look] of [
  ['light', PALETTES.light, LIGHT],
  ['dark', PALETTES.dark, DARK],
]) {
  test(`ai_query_highlight: every mark's colour keeps its contrast in the ${name} theme`, () => {
    for (const { colour } of QUERY_MARKS) {
      // a ring is a line, so 3:1 (WCAG SC 1.4.11). A badge in colour is text, so 4.5:1 (SC 1.4.3).
      for (const ground of [p.page, look.paper, look.card])
        assert.ok(contrast(queryLine(colour, p), ground) >= 3, `${colour} ring on ${ground}`);
      for (const ground of [p.page, look.card])
        assert.ok(contrast(queryLabel(colour, p), ground) >= 4.5, `${colour} badge on ${ground}`);
    }
  });
}

// proves: ai_query_highlight
test('ai_query_highlight: the untangling gives what a highlight marks with what it hides, and fades nothing', () => {
  const d = {
    boxes: ['roof', 'walls', 'sam'].map((key) => ({ key, kind: 'Thing', text: key })),
    links: [],
    estimates: [],
    groups: [],
  };
  const u = new Untangle(d);
  assert.equal(u.layers(null).marked, undefined, 'no highlight, no marks');
  u.lit = markedBy(['roof', 'walls'], FLAG);
  assert.ok(u.active(), 'a highlight can be cleared, as a filter can');
  const layers = u.layers(null);
  assert.equal(layers.kept, null, 'nothing fades');
  assert.deepEqual([...layers.hidden.things], [], 'nothing hides');
  assert.deepEqual([...layers.marked.keys()], ['roof', 'walls']);
  u.showOnly('sam', 1);
  assert.deepEqual([...u.layers(null).marked.keys()], [], 'what is hidden is not marked');
});
