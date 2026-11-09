// An HTML label's size, as our own measuring gives it (editor spec §53, layout_own_engine; Roger, 9 Nov 2026: Graphviz replaced). The sizes are
// the ones Graphviz 16.1.0 gave before it was removed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { htmlLabel } from '../src/layouts/html-label.ts';

const NEAR = 0.05;
const near = (a, b, what) =>
  a.forEach((v, i) =>
    assert.ok(Math.abs(v - b[i]) <= NEAR, `${what}: ${JSON.stringify(a)} is not ${JSON.stringify(b)}`),
  );

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
