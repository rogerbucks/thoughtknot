// Makes real .xlsx files for the workbook tests: a zip of XML parts, written with node:zlib. Not a test itself.
import { deflateRawSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** A zip of `parts` ({ name: text }); `stored` keeps them uncompressed, `lie` is added to each declared size. */
export function zip(parts, { stored = false, lie = 0 } = {}) {
  const chunks = [];
  const central = [];
  let at = 0;
  const u16 = (n) => Buffer.from([n & 255, (n >> 8) & 255]);
  const u32 = (n) => Buffer.from([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]);
  for (const [name, text] of Object.entries(parts)) {
    const raw = Buffer.from(text);
    const data = stored ? raw : deflateRawSync(raw);
    const nameBytes = Buffer.from(name);
    const head = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(stored ? 0 : 8),
      u16(0),
      u16(0),
      u32(crc32(raw)),
      u32(data.length),
      u32(raw.length + lie),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);
    central.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(stored ? 0 : 8),
        u16(0),
        u16(0),
        u32(crc32(raw)),
        u32(data.length),
        u32(raw.length + lie),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(at),
        nameBytes,
      ]),
    );
    chunks.push(head, data);
    at += head.length + data.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(central.length),
    u16(central.length),
    u32(dir.length),
    u32(at),
    u16(0),
  ]);
  return new Uint8Array(Buffer.concat([...chunks, dir, end]));
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/**
 * A workbook of `sheets` ({ name: rows }); a row is an array of cells: text, a number, `{ date: serial }`, `{ bool }`,
 * `{ inline: text }`, `{ error }`, or null for no cell. Shared strings and one date style are used as Excel does.
 */
export function workbook(sheets, { date1904 = false, stored = false } = {}) {
  const strings = [];
  const shared = (s) => {
    if (!strings.includes(s)) strings.push(s);
    return strings.indexOf(s);
  };
  const letter = (i) => String.fromCharCode(65 + i);
  const sheetXml = (rows) =>
    `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
      .map(
        (cells, r) =>
          `<row r="${r + 1}">${cells
            .map((c, i) => {
              const ref = `${letter(i)}${r + 1}`;
              if (c === null || c === undefined) return '';
              if (typeof c === 'number') return `<c r="${ref}"><v>${c}</v></c>`;
              if (typeof c === 'string') return `<c r="${ref}" t="s"><v>${shared(c)}</v></c>`;
              if ('date' in c) return `<c r="${ref}" s="1"><v>${c.date}</v></c>`;
              if ('bool' in c) return `<c r="${ref}" t="b"><v>${c.bool ? 1 : 0}</v></c>`;
              if ('inline' in c) return `<c r="${ref}" t="inlineStr"><is><t>${esc(c.inline)}</t></is></c>`;
              return `<c r="${ref}" t="e"><v>#DIV/0!</v></c>`;
            })
            .join('')}</row>`,
      )
      .join('')}</sheetData></worksheet>`;
  const names = Object.keys(sheets);
  const parts = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'xl/workbook.xml': `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr${date1904 ? ' date1904="1"' : ''}/><sheets>${names
      .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="x" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('')}</Relationships>`,
    'xl/styles.xml':
      '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
  };
  names.forEach((n, i) => (parts[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sheets[n])));
  parts['xl/sharedStrings.xml'] = `<sst>${strings.map((s) => `<si><t>${esc(s)}</t></si>`).join('')}</sst>`;
  return zip(parts, { stored });
}
