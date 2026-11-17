// The XML parts of a PowerPoint file as small trees (ES§67 format_untrusted_files). A tree is cut at a depth and at a
// A tree is cut at a depth and at a count of nodes. A relationship that leaves the zip or points to the web is never followed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deep, kid, kidsOf, relsName, relsOf, resolvePart, xmlTree } from '../src/pptx-xml.ts';

describe('pptx_xml', () => {
  test('a tree holds names without prefixes, attributes, children and the text directly in each element', () => {
    const root = xmlTree('<a:x k="1"><a:y>hi &amp; <a:z/></a:y><a:y/></a:x>', { nodes: 0 });
    const x = kid(root, 'x');
    assert.equal(x.attrs.k, '1');
    assert.equal(kidsOf(x, 'y').length, 2);
    assert.equal(kidsOf(x, 'y')[0].text, 'hi & ');
    assert.equal(deep(root, 'z').name, 'z');
    assert.equal(deep(root, 'missing'), undefined);
  });

  test('a tree nested too deep is damaged, and one with too many nodes is too big, and a broken one is damaged', () => {
    assert.throws(() => xmlTree('<a><b><c/></b></a>', { nodes: 0 }, { depth: 2, nodes: 100 }));
    assert.throws(() => xmlTree('<a><b/><b/><b/></a>', { nodes: 0 }, { depth: 9, nodes: 3 }));
    assert.throws(() => xmlTree('<a><b></a>', { nodes: 0 }));
    assert.throws(() => xmlTree('<a>', { nodes: 0 }));
  });

  test('a target is resolved against the folder of its part, and one that leaves the zip or the file is refused', () => {
    assert.equal(resolvePart('ppt/slides/', '../media/a.png'), 'ppt/media/a.png');
    assert.equal(resolvePart('ppt/slides/', '/ppt/media/a.png'), 'ppt/media/a.png');
    assert.equal(resolvePart('ppt/slides/', '../../../x'), null);
    assert.equal(resolvePart('ppt/', 'https://example.com/a.png'), null);
    assert.equal(resolvePart('ppt/', '//example.com/a.png'), null);
  });

  test('relationships are listed by id with the kind of each, and an external one is left out', () => {
    const xml =
      '<Relationships><Relationship Id="r1" Type="http://x/image" Target="../media/a.png"/><Relationship Id="r2" Type="http://x/hyperlink" Target="https://a.b" TargetMode="External"/><Relationship Id="r1" Type="http://x/other" Target="x.xml"/></Relationships>';
    const rels = relsOf(kid(xmlTree(xml, { nodes: 0 }), 'Relationships'), 'ppt/slides/slide1.xml');
    assert.deepEqual([...rels.byId], [['r1', { type: 'image', part: 'ppt/media/a.png' }]]);
    assert.equal(relsName('ppt/slides/slide1.xml'), 'ppt/slides/_rels/slide1.xml.rels');
    assert.equal(relsName('presentation.xml'), '_rels/presentation.xml.rels');
  });
});
