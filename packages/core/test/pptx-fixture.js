// Makes real .pptx files for the PowerPoint reader tests: a zip of the XML parts PowerPoint writes. Not a test itself.
import { zip } from './xlsx-fixture.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** The first bytes of each picture kind the reader keeps, with a few bytes after them. */
export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
export const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');

/** A place in inches-free EMU as an xfrm: `at` is [x, y, w, h] in pixels (9525 EMU each). */
export const xfrm = ([x, y, w, h], tag = 'a:xfrm') =>
  `<${tag}><a:off x="${x * 9525}" y="${y * 9525}"/><a:ext cx="${w * 9525}" cy="${h * 9525}"/></${tag}>`;

/** A paragraph: a string, or `{ runs, lvl, bullet: 'none' | 'char' | 'num' }`; a run may be `{ br: 1 }` or `{ fld: text }`. */
const para = (p) => {
  const o = typeof p === 'string' ? { runs: [p] } : p;
  const bu =
    { none: '<a:buNone/>', char: '<a:buChar char="•"/>', num: '<a:buAutoNum type="arabicPeriod"/>' }[o.bullet] ?? '';
  const pr = o.lvl || bu ? `<a:pPr${o.lvl ? ` lvl="${o.lvl}"` : ''}>${bu}</a:pPr>` : '';
  const runs = o.runs.map((r) => {
    if (typeof r === 'string') return `<a:r><a:t>${esc(r)}</a:t></a:r>`;
    return r.br ? '<a:br/>' : `<a:fld type="slidenum"><a:t>${esc(r.fld)}</a:t></a:fld>`;
  });
  return `<a:p>${pr}${runs.join('')}</a:p>`;
};

/** A shape: `{ ph: { type, idx }, txBox, at, geom, fill, paras, name }`. */
export const sp = (o) => {
  const ph = o.ph ? `<p:ph${o.ph.type ? ` type="${o.ph.type}"` : ''}${o.ph.idx ? ` idx="${o.ph.idx}"` : ''}/>` : '';
  const geom = o.geom ? `<a:prstGeom prst="${o.geom}"><a:avLst/></a:prstGeom>` : '';
  const fill = o.fill ? '<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>' : '';
  const body = o.paras ? `<p:txBody><a:bodyPr/>${o.paras.map(para).join('')}</p:txBody>` : '';
  return `<p:sp><p:nvSpPr><p:cNvPr id="2" name="${o.name ?? 'S'}"/><p:cNvSpPr${o.txBox ? ' txBox="1"' : ''}/><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr>${o.at ? xfrm(o.at) : ''}${geom}${fill}</p:spPr>${body}</p:sp>`;
};

/** A picture of the relationship `embed`, at `at`, with alt text `alt`. */
export const pic = ({ embed, at, alt = '', video = false }) =>
  `<p:pic><p:nvPicPr><p:cNvPr id="3" name="P" descr="${esc(alt)}"/><p:cNvPicPr/><p:nvPr>${video ? '<a:videoFile r:link="rId9"/>' : ''}</p:nvPr></p:nvPicPr><p:blipFill><a:blip r:embed="${embed}"/></p:blipFill><p:spPr>${at ? xfrm(at) : ''}</p:spPr></p:pic>`;

/** A group of shapes whose children are laid out on a [0, 0, cw, ch] grid and shown at `at`. */
export const grp = (at, [cw, ch], inner) =>
  `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="4" name="G"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${at[0] * 9525}" y="${at[1] * 9525}"/><a:ext cx="${at[2] * 9525}" cy="${at[3] * 9525}"/><a:chOff x="0" y="0"/><a:chExt cx="${cw * 9525}" cy="${ch * 9525}"/></a:xfrm></p:grpSpPr>${inner}</p:grpSp>`;

/** A graphic frame: a table of `rows`, or by `uri` a chart, a diagram or an embedded object. */
export const frame = ({ rows, uri = '', at = [0, 0, 100, 100] }) => {
  const tbl = rows
    ? `<a:tbl>${rows.map((r) => `<a:tr>${r.map((c) => `<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>${esc(c)}</a:t></a:r></a:p></a:txBody></a:tc>`).join('')}</a:tr>`).join('')}</a:tbl>`
    : '';
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="5" name="F"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>${xfrm(at, 'p:xfrm')}<a:graphic><a:graphicData uri="${uri || 'http://schemas.openxmlformats.org/drawingml/2006/table'}">${tbl}</a:graphicData></a:graphic></p:graphicFrame>`;
};

const rels = (list) =>
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list
    .map(
      ([id, type, target, mode]) =>
        `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"${mode ? ` TargetMode="${mode}"` : ''}/>`,
    )
    .join('')}</Relationships>`;

/**
 * A deck: `slides` are `{ shapes: [xml], notes: [lines], hidden, media: { rId: [part, bytes] }, links: [[id, url]] }`, in
 * the order the deck plays them. `order` lists slide numbers in the order of `sldIdLst`, when it differs from the files.
 */
export function deck(slides, { size = [12192000, 6858000], order, extra = {}, ...options } = {}) {
  const parts = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'ppt/presentation.xml': `<?xml version="1.0"?><p:presentation ${NS}><p:sldIdLst>${(order ?? slides.map((_, i) => i + 1)).map((n, i) => `<p:sldId id="${256 + i}" r:id="rId${n + 10}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${size[0]}" cy="${size[1]}"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': rels(
      slides.map((_, i) => [`rId${i + 11}`, 'slide', `slides/slide${i + 1}.xml`]),
    ),
    'ppt/slideMasters/slideMaster1.xml': `<p:sldMaster ${NS}><p:cSld><p:spTree>${sp({ ph: { type: 'title' }, at: [60, 30, 1160, 100] })}${sp({ ph: { type: 'body', idx: '1' }, at: [60, 150, 1160, 500] })}</p:spTree></p:cSld></p:sldMaster>`,
    'ppt/slideLayouts/slideLayout1.xml': `<p:sldLayout ${NS}><p:cSld><p:spTree>${sp({ ph: { type: 'ctrTitle' } })}${sp({ ph: { idx: '1' }, at: [80, 200, 600, 400] })}</p:spTree></p:cSld></p:sldLayout>`,
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]),
  };
  slides.forEach((s, i) => {
    const n = i + 1;
    const media = Object.entries(s.media ?? {});
    parts[`ppt/slides/slide${n}.xml`] =
      `<?xml version="1.0"?><p:sld ${NS}${s.hidden ? ' show="0"' : ''}><p:cSld><p:spTree>${s.shapes.join('')}</p:spTree></p:cSld></p:sld>`;
    parts[`ppt/slides/_rels/slide${n}.xml.rels`] = rels([
      ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
      ...(s.notes ? [['rId2', 'notesSlide', `../notesSlides/notesSlide${n}.xml`]] : []),
      ...media.map(([id, [part]]) => [id, 'image', `../media/${part}`]),
      ...(s.links ?? []).map(([id, url]) => [id, 'hyperlink', url, 'External']),
    ]);
    for (const [, [part, bytes]] of media) parts[`ppt/media/${part}`] = bytes;
    if (s.notes)
      parts[`ppt/notesSlides/notesSlide${n}.xml`] =
        `<p:notes ${NS}><p:cSld><p:spTree>${sp({ ph: { type: 'sldImg' } })}${sp({ ph: { type: 'body', idx: '1' }, paras: s.notes })}</p:spTree></p:cSld></p:notes>`;
  });
  return zip({ ...parts, ...extra }, options);
}
