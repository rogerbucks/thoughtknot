// Makes real PDF files for the PDF reader tests, written with node:zlib. Not a test itself.
import { deflateSync } from 'node:zlib';

const lit = (s) => `(${s.replace(/[\\()]/g, '\\$&')})`;
const hex = (s) => `<${Buffer.from(s, 'latin1').toString('hex')}>`;

/** The content stream of one page: `lines` are strings; an array is a TJ run of strings and gaps. */
function content(lines, { font = 'F1', twoByte = false } = {}) {
  const show = (t) =>
    twoByte ? hex(String.fromCharCode(...[...t].flatMap((c) => [0, c.charCodeAt(0) - 31]))) : lit(t);
  return `BT /${font} 12 Tf 14 TL 72 700 Td ${lines
    .map(
      (l, i) =>
        `${i ? 'T* ' : ''}${Array.isArray(l) ? `[${l.map((x) => (typeof x === 'number' ? x : show(x))).join(' ')}] TJ` : `${show(l)} Tj`}`,
    )
    .join(' ')} ET`;
}

/** A ToUnicode map that sends code c (two bytes) to the letter with code c + 31. */
const CMAP = `/CIDInit begin begincmap 1 begincodespacerange <0000> <FFFF> endcodespacerange 1 beginbfrange <0001> <00E0> <0020> endbfrange endcmap`;

/**
 * A PDF of `pages`, each an array of lines. Options: `flate` deflates the streams. `objstm` packs the catalog, page
 * tree and pages into an object stream. `twoByte` uses a two-byte font with a ToUnicode map. `encrypt` adds an
 * /Encrypt entry. `scanned` gives pages with no text.
 */
export function pdf(pages, { flate = true, objstm = false, twoByte = false, encrypt = false, scanned = false } = {}) {
  const objs = [];
  const add = (body) => objs.push(body) && objs.length;
  const stream = (dict, data) => {
    const raw = flate ? deflateSync(Buffer.from(data, 'latin1')) : Buffer.from(data, 'latin1');
    return `<< ${dict}${flate ? ' /Filter /FlateDecode' : ''} /Length ${raw.length} >>\nstream\n${raw.toString('latin1')}\nendstream`;
  };
  const cat = 1;
  const tree = 2;
  objs.push('', '');
  const font = twoByte ? 5 : 4;
  const fonts = {
    4: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    5: '<< /Type /Font /Subtype /Type0 /BaseFont /X /Encoding /Identity-H /ToUnicode 6 0 R >>',
  };
  objs.push(''); // 3 is left empty so numbers stay steady
  objs.push(twoByte ? '<< >>' : fonts[4]);
  objs.push(twoByte ? fonts[5] : '<< >>');
  objs.push(stream('', CMAP));
  const kids = [];
  const pageBodies = pages.map((lines) => {
    const c = add(stream('', scanned ? 'q 1 0 0 1 0 0 cm Q' : content(lines, { twoByte })));
    const id = objs.length + 1;
    kids.push(id);
    objs.push(`<< /Type /Page /Parent 2 0 R /Contents ${c} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`);
    return id;
  });
  const catalog = `<< /Type /Catalog /Pages 2 0 R${encrypt ? ' /Encrypt << /Filter /Standard >>' : ''} >>`;
  const treeBody = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const packed = { 1: catalog, 2: treeBody };
  if (objstm) {
    const ids = [1, 2, ...pageBodies];
    const bodies = ids.map((id) => packed[id] ?? objs[id - 1]);
    let head = '';
    let body = '';
    ids.forEach((id, i) => {
      head += `${id} ${body.length} `;
      body += `${bodies[i]}\n`;
    });
    const s = head + body;
    for (const id of ids) objs[id - 1] = null;
    objs.push(stream(`/Type /ObjStm /N ${ids.length} /First ${head.length}`, s));
  } else {
    objs[0] = catalog;
    objs[1] = treeBody;
  }
  let out = '%PDF-1.5\n';
  objs.forEach((o, i) => {
    if (o !== null && o !== '') out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  out += 'trailer\n<< /Root 1 0 R >>\n%%EOF\n';
  return new Uint8Array(Buffer.from(out, 'latin1'));
}
