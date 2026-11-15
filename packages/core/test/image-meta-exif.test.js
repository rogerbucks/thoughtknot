// The Exif block of an image (editor spec §18, image_meta_first). Its description, Windows' title and keywords, date
// taken and place are read from a small TIFF inside the image. Each read is held to the bytes there.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readExif } from '../src/image-meta-exif.ts';
import { exif } from './image-meta-bytes.js';

describe('an Exif block says what its image is', () => {
  // proves: image_meta_first
  test('the description, Windows title, keywords, date and place are read; a date of month 00 is none', () => {
    const m = readExif(
      Uint8Array.from(
        exif({
          description: 'Dog',
          xpTitle: 'Win',
          xpKeywords: 'a;b',
          taken: '2022:03:04 05:06:07',
          gps: { lat: 10, lon: 20 },
        }),
      ),
    );
    assert.equal(m.title, 'Win');
    assert.deepEqual(m.keywords, ['a', 'b']);
    assert.equal(m.date, '2022-03-04T05:06:07');
    assert.deepEqual(m.place, { lat: -10, lon: -20 });
    assert.equal(readExif(Uint8Array.from(exif({ taken: '0000:00:00 00:00:00' }))).date, undefined);
  });

  // proves: image_meta_first
  test('bytes that are no TIFF, or point outside themselves, say nothing', () => {
    assert.deepEqual(readExif(Uint8Array.from([1, 2, 3])), { keywords: [] });
    const lies = Uint8Array.from([
      0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 0xff, 0xff, 0x0e, 0x01, 2, 0, 0xff, 0xff, 0xff, 0x7f, 0xf0, 0xff, 0xff, 0xff,
    ]);
    assert.deepEqual(readExif(lies), { keywords: [] });
  });
});
