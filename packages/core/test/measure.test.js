// Our own measuring of a layout source, with no Graphviz (editor spec §53, layout_own_engine; Roger, 9 Nov 2026:
// Graphviz replaced). Each box and label must come out the size Graphviz gave it, in the same place. So the drawings
// our own engine lays out from them stay as they were. The cases were measured by Graphviz before it was removed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { measuredLayout, measuredMarks } from '../src/layouts/measure.ts';

const { cases } = JSON.parse(readFileSync(new URL('fixtures/measure-cases.json', import.meta.url), 'utf8'));
const NEAR = 0.05;
const near = (a, b, what) =>
  a.forEach((v, i) =>
    assert.ok(Math.abs(v - b[i]) <= NEAR, `${what}: ${JSON.stringify(a)} is not ${JSON.stringify(b)}`),
  );

describe('our own measuring', () => {
  for (const c of cases)
    test(`sizes every box and label as Graphviz did: ${c.features.join(', ')}`, () => {
      const laid = measuredMarks(c.source);
      const box = new Map(laid.marks.filter((m) => m.role === 'thing').map((m) => [m.of, m]));
      const mine = new Map(laid.marks.map((m) => [m.id, m]));
      for (const want of c.marks) {
        const m = mine.get(want.id);
        assert.ok(m, `${want.id} is drawn`);
        const r = box.get(m.of);
        assert.equal(m.style, want.style, want.id);
        near([m.x - r.x, m.y - r.y], want.at, `${want.id} place`);
        if (want.size) {
          near([m.width, m.height], want.size, `${want.id} size`);
          if (want.shape) assert.equal(m.shape, want.shape, want.id);
        } else {
          assert.equal(m.text, want.text);
          near([m.size, m.maxWidth ?? 0], [want.font, want.width], `${want.id} font`);
        }
      }
      assert.equal(laid.layout?.lost, undefined, 'every colour is one a style token gives back');
    });

  test('puts each box where its pos says, the drawing moved to start at nought', () => {
    const src =
      'digraph G { node [shape=box, margin="0.24,0.15"]; "a" [pos="100,50"]; "b" [pos="400,50"]; "a" -> "b"; }';
    const laid = measuredLayout(src);
    const [a, b] = laid.objects;
    assert.equal(Number(b.pos.split(',')[0]) - Number(a.pos.split(',')[0]), 300);
    assert.equal(laid.bb.split(',')[0], '0');
    assert.equal(laid.edges.length, 1);
  });
});

describe('layout_own_engine: groups as nop gives them', () => {
  test('a group with no bb is not drawn and does not grow the drawing', () => {
    const src = 'digraph{subgraph cluster_a{label="L"; a[pos="0,0"]; b[pos="100,0"]} a->b}';
    const out = measuredLayout(src);
    // Graphviz 16.1.0 nop gives 0,0,154,36 here
    assert.equal(out.bb, '0,0,154,36');
    assert.equal(out.objects[0].name, 'cluster_a');
    assert.equal(out.objects[0]._draw_, undefined);
  });
  test('a group with a bb is drawn there, the drawing grown to hold it', () => {
    const src =
      'digraph{subgraph cluster_a{bb="-50,-30,150,40"; style=rounded; label="L"; a[pos="0,0"]; b[pos="100,0"]} a->b}';
    const out = measuredLayout(src);
    assert.equal(out.bb, '0,0,200,70');
    assert.equal(out.objects[0].bb, '0,0,200,70');
    assert.equal(out.objects[0]._draw_?.at(-1)?.op, 'b');
  });
});
