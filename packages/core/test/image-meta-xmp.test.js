// The XMP packet of an image (editor spec §18, image_meta_first). Its title, description, keywords and date are found
// element by element, never by parsing the whole. So a hostile packet costs one pass, and no entity grows.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readXmp, unescapedXml, xmpDate } from '../src/image-meta-xmp.ts';
import { xmpPacket } from './image-meta-bytes.js';

describe('an XMP packet says what its image is', () => {
  // proves: image_meta_first
  test('the default language wins, and only the five plain entities and numeric references are read', () => {
    const xml =
      '<dc:title><rdf:Alt><rdf:li xml:lang="fr">Port</rdf:li><rdf:li xml:lang="x-default">Harbour &amp; &#65;&lt;</rdf:li></rdf:Alt></dc:title>';
    assert.equal(readXmp(xml).title, 'Harbour & A<');
    assert.equal(unescapedXml('&bomb; &#0; &#xD800;'), '&bomb; &#0; &#xD800;');
  });

  // proves: image_meta_first
  test('tags inside a title are left out, and no stray angle bracket remains', () => {
    assert.equal(readXmp('<dc:title><b>Big</b> <<script>x</dc:title>').title, 'Big x');
  });

  // proves: image_meta_first
  test('a date is cut to its date and time with no zone, and a bad one is none', () => {
    assert.equal(xmpDate('2024-05-01T06:10:00+10:00'), '2024-05-01T06:10:00');
    assert.equal(xmpDate('2024-05-01'), '2024-05-01');
    assert.equal(xmpDate('last week'), undefined);
    assert.equal(readXmp(xmpPacket({ date: '2020-02-03T01:02:03Z' })).date, '2020-02-03T01:02:03');
  });

  // proves: image_meta_first
  test('a packet that never closes, or is huge, is read as far as it goes', () => {
    assert.deepEqual(readXmp('<dc:title><rdf:Alt><rdf:li>open'), { keywords: [] });
    const huge = `${'<rdf:li>'.repeat(100_000)}`;
    assert.deepEqual(readXmp(`<dc:subject><rdf:Bag>${huge}</rdf:Bag></dc:subject>`).keywords, []);
  });
});
