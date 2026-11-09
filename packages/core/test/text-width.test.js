// A text's width, as our own measuring estimates it (editor spec §53, layout_own_engine; Roger, 9 Nov 2026: Graphviz replaced). The sizes are
// the ones Graphviz 16.1.0 gave before it was removed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { textWidth } from '../src/layouts/text-width.ts';

const NEAR = 0.05;
const near = (a, b, what) =>
  a.forEach((v, i) =>
    assert.ok(Math.abs(v - b[i]) <= NEAR, `${what}: ${JSON.stringify(a)} is not ${JSON.stringify(b)}`),
  );

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
