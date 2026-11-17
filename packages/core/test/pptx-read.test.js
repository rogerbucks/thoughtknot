// A PowerPoint deck (.pptx) read as slides in plain JavaScript (ES§45 board_exchange, ES§67 format_untrusted_files).
// The files are made by pptx-fixture.js: a real zip of the XML parts PowerPoint writes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pptxSlides, PPTX_LIMITS } from '../src/pptx-read.ts';
import { PNG, JPEG, SVG, deck, frame, grp, pic, sp, xfrm } from './pptx-fixture.js';
import { document } from './docx-fixture.js';

const TITLE = { ph: { type: 'title' }, paras: ['Plan for <2027>'] };

describe('pptx_read_slides', () => {
  for (const stored of [false, true]) {
    test(`reads each slide's title, text and size in the order the deck plays them, ${stored ? 'stored' : 'deflated'}`, () => {
      const got = pptxSlides(
        deck(
          [
            { shapes: [sp({ ph: { type: 'title' }, paras: ['Second in file'] })] },
            { shapes: [sp(TITLE), sp({ txBox: true, at: [10, 20, 300, 40], paras: ['A & B'] })], hidden: true },
          ],
          { order: [2, 1], stored },
        ),
      );
      assert.deepEqual(got.size, { w: 1280, h: 720 });
      assert.deepEqual(
        got.slides.map((s) => [s.n, s.title, s.hidden]),
        [
          [1, 'Plan for <2027>', true],
          [2, 'Second in file', false],
        ],
      );
      assert.deepEqual(got.slides[0].shapes[1], {
        kind: 'text',
        title: false,
        box: { x: 10, y: 20, w: 300, h: 40 },
        paras: [{ text: 'A & B', level: 0, bullet: 'none' }],
      });
    });
  }

  test('a content placeholder is a bullet list; a text box is bullets only where it says so; numbers and breaks read', () => {
    const [slide] = pptxSlides(
      deck([
        {
          shapes: [
            sp({
              ph: { idx: '1' },
              paras: [
                'First',
                { runs: ['Deeper'], lvl: 1 },
                { runs: ['Plain'], bullet: 'none' },
                { runs: ['Line', { br: 1 }, 'two'] },
              ],
            }),
            sp({
              txBox: true,
              at: [0, 0, 50, 50],
              paras: [
                'No bullet',
                { runs: ['Dot'], bullet: 'char' },
                { runs: ['One'], bullet: 'num' },
                { runs: ['Two'], bullet: 'num' },
              ],
            }),
            sp({ ph: { type: 'sldNum' }, paras: [{ runs: [{ fld: '3' }] }] }),
            sp({ ph: { type: 'ftr' }, paras: ['Footer'] }),
          ],
        },
      ]),
    ).slides;
    assert.deepEqual(slide.shapes[0].paras, [
      { text: 'First', level: 0, bullet: 'dot' },
      { text: 'Deeper', level: 1, bullet: 'dot' },
      { text: 'Plain', level: 0, bullet: 'none' },
      { text: 'Line\ntwo', level: 0, bullet: 'dot' },
    ]);
    assert.deepEqual(
      slide.shapes[1].paras.map((p) => p.bullet),
      ['none', 'dot', 'number', 'number'],
    );
    assert.equal(slide.shapes.length, 2, 'a slide number and a footer are left out');
  });

  test('a placeholder with no place takes its layout, then its master; its own place wins', () => {
    const [slide] = pptxSlides(
      deck([
        {
          shapes: [
            sp({ ph: { type: 'ctrTitle' }, paras: ['Centred'] }),
            sp({ ph: { idx: '1' }, paras: ['Body'] }),
            sp({ ph: { idx: '1' }, at: [5, 6, 7, 8], paras: ['Own'] }),
            sp({ ph: { type: 'subTitle', idx: '9' }, paras: ['Nowhere'] }),
          ],
        },
      ]),
    ).slides;
    assert.deepEqual(slide.shapes[0].box, { x: 60, y: 30, w: 1160, h: 100 });
    assert.equal(slide.shapes[0].title, true);
    assert.deepEqual(slide.shapes[1].box, { x: 80, y: 200, w: 600, h: 400 });
    assert.deepEqual(slide.shapes[2].box, { x: 5, y: 6, w: 7, h: 8 });
    assert.equal(slide.shapes[3].box, null);
  });

  test('a group moves and scales what is in it, and a nested group does so twice', () => {
    const inner = grp([0, 0, 100, 100], [100, 100], sp({ txBox: true, at: [10, 10, 20, 20], paras: ['Deep'] }));
    const [slide] = pptxSlides(
      deck([
        {
          shapes: [
            grp([200, 100, 400, 400], [200, 200], sp({ txBox: true, at: [100, 50, 40, 20], paras: ['In'] }) + inner),
          ],
        },
      ]),
    ).slides;
    assert.deepEqual(slide.shapes[0].box, { x: 400, y: 200, w: 80, h: 40 });
    assert.deepEqual(slide.shapes[1].box, { x: 220, y: 120, w: 40, h: 40 });
  });

  test('a shape keeps its kind, place and words; an empty plain shape is left out and a line is counted', () => {
    const got = pptxSlides(
      deck([
        {
          shapes: [
            sp({ geom: 'ellipse', at: [1, 2, 3, 4], fill: true, paras: ['Round'] }),
            sp({ geom: 'rect', at: [1, 2, 3, 4], fill: true }),
            sp({ geom: 'diamond', at: [1, 2, 3, 4], fill: true }),
            sp({ geom: 'rect', at: [1, 2, 3, 4] }),
            sp({ geom: 'line', at: [1, 2, 3, 4] }),
            '<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="9" name="C"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr/></p:cxnSp>',
          ],
        },
      ]),
    );
    assert.deepEqual(
      got.slides[0].shapes.map((s) => [s.kind, s.geom, s.paras.length]),
      [
        ['shape', 'ellipse', 1],
        ['shape', 'box', 0],
        ['shape', 'box', 0],
      ],
    );
    assert.equal(got.left.lines, 2);
  });

  test('a table is its rows; a chart, a diagram and an object are counted, not read', () => {
    const got = pptxSlides(
      deck([
        {
          shapes: [
            frame({
              rows: [
                ['Item', 'Cost <1>'],
                ['Rent', '12'],
              ],
              at: [10, 10, 200, 100],
            }),
            frame({ uri: 'http://schemas.openxmlformats.org/drawingml/2006/chart' }),
            frame({ uri: 'http://schemas.openxmlformats.org/drawingml/2006/diagram' }),
            frame({ uri: 'http://schemas.openxmlformats.org/presentationml/2006/ole' }),
          ],
        },
      ]),
    );
    assert.deepEqual(got.slides[0].shapes, [
      {
        kind: 'table',
        box: { x: 10, y: 10, w: 200, h: 100 },
        rows: [
          ['Item', 'Cost <1>'],
          ['Rent', '12'],
        ],
      },
    ]);
    assert.deepEqual([got.left.charts, got.left.smartart, got.left.objects], [1, 1, 1]);
  });

  test('speaker notes are read from the notes placeholder alone', () => {
    const [slide] = pptxSlides(deck([{ shapes: [sp(TITLE)], notes: ['Say hello', 'Then <pause>'] }])).slides;
    assert.equal(slide.notes, 'Say hello\nThen <pause>');
  });
});

describe('pptx_read_pictures', () => {
  test('a PNG and a JPEG are kept once however many slides use them, with their alt text and place', () => {
    const slideWith = (id) => ({
      shapes: [pic({ embed: id, at: [10, 20, 30, 40], alt: 'Logo <1>' })],
      media: { rId5: ['image1.png', PNG], rId6: ['photo.jpeg', JPEG] },
    });
    const got = pptxSlides(deck([slideWith('rId5'), slideWith('rId6'), slideWith('rId5')]));
    assert.deepEqual(
      [...got.pictures.values()].map((p) => [p.part, p.ending, p.bytes.length]),
      [
        ['ppt/media/image1.png', 'png', 11],
        ['ppt/media/photo.jpeg', 'jpg', 7],
      ],
    );
    assert.deepEqual(got.slides[0].shapes[0], {
      kind: 'picture',
      box: { x: 10, y: 20, w: 30, h: 40 },
      alt: 'Logo <1>',
      part: 'ppt/media/image1.png',
    });
    assert.equal(got.left.pictures, 0);
  });

  test('a picture is read by its first bytes: an SVG named .png, an oversize one and a lost one are counted, once each', () => {
    const big = Buffer.concat([PNG, Buffer.alloc(8_000_000)]);
    const slide = {
      shapes: [pic({ embed: 'rId5' }), pic({ embed: 'rId5' }), pic({ embed: 'rId6' }), pic({ embed: 'rId7' })],
      media: { rId5: ['liar.png', SVG], rId6: ['big.png', big] },
    };
    const got = pptxSlides(deck([slide]));
    assert.equal(got.pictures.size, 0);
    assert.equal(got.slides[0].shapes.length, 0);
    assert.equal(got.left.pictures, 3);
  });

  test('a link to the web is never followed and a video keeps only its poster picture', () => {
    const got = pptxSlides(
      deck([
        {
          shapes: [pic({ embed: 'rId5', video: true }), pic({ embed: 'rId8' })],
          media: { rId5: ['poster.png', PNG] },
          links: [['rId8', 'https://example.com/x.png']],
        },
      ]),
    );
    assert.equal(got.slides[0].shapes.length, 1);
    assert.equal(got.left.media, 1);
    assert.equal(got.left.pictures, 1);
  });

  test('where a newer feature has a plainer form, the plainer form is read', () => {
    const alt = `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="x">${sp({ txBox: true, at: [0, 0, 9, 9], paras: ['Newer'] })}</mc:Choice><mc:Fallback>${sp({ txBox: true, at: [0, 0, 9, 9], paras: ['Plainer'] })}</mc:Fallback></mc:AlternateContent>`;
    const [slide] = pptxSlides(deck([{ shapes: [alt] }])).slides;
    assert.deepEqual(
      slide.shapes.map((s) => s.paras[0].text),
      ['Plainer'],
    );
  });
});

describe('pptx_read_refusals', () => {
  const one = (extra) => deck([{ shapes: [sp(TITLE)] }], extra);

  test('a Word file, plain bytes, an old .ppt and a zip with no presentation are named, not read', () => {
    assert.equal(pptxSlides(document(['x'])).why, 'not-pptx');
    assert.equal(pptxSlides(new Uint8Array([1, 2, 3])).why, 'not-pptx');
    assert.equal(
      pptxSlides(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0])).why,
      'old-or-encrypted',
    );
    assert.match(
      pptxSlides(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])).refused,
      /\.pptx with no password/,
    );
    assert.equal(pptxSlides(deck([])).why, 'empty');
  });

  test('a document type line, a lying size and a broken slide are refused as damage, never half read', () => {
    assert.equal(
      pptxSlides(one({ extra: { 'ppt/slides/slide1.xml': '<!DOCTYPE x [<!ENTITY a "b">]><p:sld/>' } })).why,
      'damaged',
    );
    assert.equal(pptxSlides(one({ lie: 5 })).why, 'damaged');
    assert.equal(
      pptxSlides(one({ extra: { 'ppt/slides/slide1.xml': '<p:sld><p:cSld><p:spTree></p:cSld></p:sld>' } })).why,
      'damaged',
    );
    assert.equal(pptxSlides(one({ extra: { 'ppt/slides/slide1.xml': '<p:sld/>' } })).why, 'damaged');
    const deepXml = `<p:sld>${'<a:x>'.repeat(100)}${'</a:x>'.repeat(100)}</p:sld>`;
    assert.equal(pptxSlides(one({ extra: { 'ppt/slides/slide1.xml': deepXml } })).why, 'damaged');
  });

  test('a deck over a limit is refused with the limit in words: bytes, inflated size, slides, shapes and text', () => {
    const many = deck(Array.from({ length: 4 }, () => ({ shapes: [sp(TITLE)] })));
    assert.equal(pptxSlides(many, { bytes: 100 }).why, 'too-large');
    assert.equal(pptxSlides(many, { inflated: 500 }).why, 'too-large');
    assert.equal(pptxSlides(many, { part: 50 }).why, 'too-large');
    assert.equal(pptxSlides(many, { shapes: 3 }).why, 'too-large');
    const slides = pptxSlides(many, { slides: 3 });
    assert.equal(slides.why, 'too-many-slides');
    assert.match(slides.refused, /more than 3 slides/);
    assert.equal(pptxSlides(many, { text: 5 }).why, 'text-too-long');
    assert.ok(PPTX_LIMITS.slides >= 100);
  });

  test('a slide count that is a lie in the relationships cannot reach outside the zip', () => {
    const got = pptxSlides(
      deck([{ shapes: [sp(TITLE)] }], {
        extra: {
          'ppt/_rels/presentation.xml.rels':
            '<Relationships xmlns="x"><Relationship Id="rId11" Type="http://x/slide" Target="../../../etc/passwd"/></Relationships>',
        },
      }),
    );
    assert.equal(got.why, 'empty');
  });

  test('the place of a shape in a file that gives none is null, never a made-up number', () => {
    const [slide] = pptxSlides(
      deck([
        {
          shapes: [
            '<p:sp><p:nvSpPr><p:cNvPr id="1" name="x"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="1"/></a:xfrm></p:spPr><p:txBody><a:p><a:r><a:t>Hi</a:t></a:r></a:p></p:txBody></p:sp>',
          ],
        },
      ]),
    ).slides;
    assert.equal(slide.shapes[0].box, null);
    assert.ok(xfrm([0, 0, 1, 1]).includes('a:off'));
  });
});
