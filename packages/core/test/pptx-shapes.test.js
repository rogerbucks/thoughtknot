// The shapes of one PowerPoint slide read into text, pictures, tables and boxes (ES§45 board_exchange).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { px, textOf } from '../src/pptx-shapes.ts';
import { xmlTree, kid } from '../src/pptx-xml.ts';

const para = (xml) => kid(xmlTree(xml, { nodes: 0 }), 'p');

describe('pptx_shapes', () => {
  test('a size in EMU is whole pixels at 96 to the inch, and a missing or bad one is 0', () => {
    assert.deepEqual([px('9525'), px('914400'), px('12192000'), px(undefined), px('x')], [1, 96, 1280, 0, 0]);
  });

  test('a paragraph is its runs, breaks and fields in order, and text over the limit is refused', () => {
    const p = para('<a:p><a:r><a:t>One </a:t></a:r><a:br/><a:fld><a:t>2</a:t></a:fld><a:endParaRPr/></a:p>');
    assert.equal(textOf(p, 100), 'One \n2');
    assert.throws(
      () => textOf(p, 2),
      (e) => e.why === 'text-too-long' && e.most === 2,
    );
  });
});
