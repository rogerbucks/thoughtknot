// Our own measuring of a layout source, with no Graphviz (editor spec §53, layout_own_engine; Roger, 9 Nov 2026:
// Graphviz replaced). Each box and label must come out the size Graphviz gave it, in the same place. So the drawings
// our own engine lays out from them stay as they were. The cases were measured by Graphviz before it was removed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { measuredLayout, measuredMarks } from '../src/layouts/measure.ts';
import { textWidth } from '../src/layouts/text-width.ts';
import { htmlLabel } from '../src/layouts/html-label.ts';
import { readDot, DotError } from '../src/layouts/dot-read.ts';

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

describe('a text’s width, as Graphviz estimates it', () => {
  test('letter by letter, for the families it knows, and Times for any other', () => {
    near([textWidth('Hello, World! {x}', 12.5, 'Helvetica')], [89.62], 'Helvetica');
    near([textWidth('Times text 123', 14, 'Times-Roman')], [83.99], 'Times');
    near([textWidth('mono', 10, 'Courier')], [24], 'Courier');
    near([textWidth('Times text 123', 14, 'Inter')], [83.99], 'an unknown family');
  });

  test('a byte past ASCII is a quarter-em and a bit, as Graphviz counts it', () => {
    near([textWidth('Ünïcødé — “quotes” 中文 😀', 9, 'Helvetica')], [119.05], 'characters past ASCII');
    near([textWidth('a⁨b⁩', 10.5, 'Helvetica')], [29.18], 'the bidi marks round a right-to-left name');
  });

  test('bold has its own widths', () => {
    near([textWidth('order_id', 9, 'Helvetica', true)], [36.01], 'bold');
    near([textWidth('order_id', 9, 'Helvetica')], [33.02], 'plain');
  });
});

describe('an HTML label', () => {
  const font = { size: 12.5, face: 'Helvetica', color: '#0000fd' };
  test('is as big as its table: columns, rows, padding and spacing', () => {
    const l = htmlLabel(
      '<table border="0" cellborder="0" cellspacing="1" cellpadding="0"><tr><td cellpadding="0"><font point-size="9">STEP</font></td></tr><tr><td cellpadding="0" height="3"></td></tr><tr><td cellpadding="1">Plan</td></tr></table>',
      font,
    );
    near([l.width, l.height], [29.02, 34.8], 'the label');
  });

  test('of lines in one size is a size and a fifth a line; of mixed sizes or bold, its sizes alone', () => {
    near([htmlLabel('A<br/>B', font).height], [30], 'one size');
    near([htmlLabel('A<br/><font point-size="9">B</font>', font).height], [21.5], 'mixed sizes');
    near([htmlLabel('<b>X</b><br/><b>Y</b>', { ...font, size: 10 }).height], [20], 'bold');
  });
});

describe('reading a layout source', () => {
  test('reads defaults, things, links, chains and groups inside groups', () => {
    const g = readDot(
      'digraph G { node [shape=box]; subgraph cluster_a { label=<A>; a; subgraph cluster_b { b; } } { rank=same; c; } a -> b -> c [label="x"]; }',
    );
    assert.equal(g.directed, true);
    assert.deepEqual(
      g.nodes.map((n) => [n.key, n.attrs.shape]),
      [
        ['a', 'box'],
        ['b', 'box'],
        ['c', 'box'],
      ],
    );
    assert.deepEqual(
      g.edges.map((e) => [e.tail, e.head, e.attrs.label]),
      [
        ['a', 'b', 'x'],
        ['b', 'c', 'x'],
      ],
    );
    assert.deepEqual(
      g.groups.map((x) => [x.name, x.members, x.groups.map((y) => y.name)]),
      [['cluster_a', ['a', 'b'], ['cluster_b']]],
    );
  });

  test('refuses what is not DOT', () => {
    assert.throws(() => readDot('digraph G { a -> '), DotError);
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
