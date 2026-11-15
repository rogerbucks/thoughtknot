// Images with metadata, made byte by byte for the tests of image_meta_first (editor spec §18). There is a JPEG with an
// Exif block, an XMP packet and IPTC records. There is a PNG with text chunks, and a WebP with an XMP chunk. Only the
// parts the reader looks at are real. The picture data is a placeholder.
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
const be16 = (n) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const le16 = (n) => [n & 0xff, (n >> 8) & 0xff];
const le32 = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const utf8 = (s) => [...new TextEncoder().encode(s)];
const utf16 = (s) => [...s].flatMap((c) => le16(c.charCodeAt(0))).concat([0, 0]);

/** A little-endian Exif TIFF: ImageDescription, XP title and keywords, a date taken and a GPS place (in the south-west). */
export function exif({ description, xpTitle, xpKeywords, taken, gps } = {}) {
  const tags = []; // [tag, type, count, bytes]
  if (description !== undefined) tags.push([0x010e, 2, description.length + 1, [...ascii(description), 0]]);
  if (xpTitle !== undefined) tags.push([0x9c9b, 1, utf16(xpTitle).length, utf16(xpTitle)]);
  if (xpKeywords !== undefined) tags.push([0x9c9e, 1, utf16(xpKeywords).length, utf16(xpKeywords)]);
  const subs = [];
  if (taken) subs.push([0x8769, [[0x9003, 2, 20, [...ascii(taken), 0]]]]);
  if (gps) {
    const r = (d) => [...le32(d), ...le32(1)];
    const dms = (v) => [
      ...r(Math.floor(v)),
      ...r(Math.floor((v % 1) * 60)),
      ...le32(Math.round(((v * 60) % 1) * 6000)),
      ...le32(100),
    ];
    subs.push([
      0x8825,
      [
        [1, 2, 2, [...ascii('S'), 0]],
        [2, 5, 3, dms(gps.lat)],
        [3, 2, 2, [...ascii('W'), 0]],
        [4, 5, 3, dms(gps.lon)],
      ],
    ]);
  }
  // lay the directories out one after another: IFD0, then each sub-directory, then every value that does not fit in 4 bytes
  const dirs = [tags.map((t) => t), ...subs.map(([, list]) => list)];
  const header = [0x49, 0x49, 0x2a, 0, ...le32(8)];
  const pointers = subs.map(([tag], i) => [tag, 4, 1, i]);
  const ifd0 = [...tags, ...pointers];
  const sizes = dirs.map((d, i) => 2 + (i === 0 ? ifd0.length : d.length) * 12 + 4);
  const starts = [8];
  for (let i = 1; i < dirs.length; i++) starts.push(starts[i - 1] + sizes[i - 1]);
  let pool = starts[starts.length - 1] + sizes[sizes.length - 1];
  const values = [];
  const entry = (tag, type, count, bytes, dirStart) => {
    if (bytes.length <= 4)
      return [...le16(tag), ...le16(type), ...le32(count), ...bytes, ...Array(4 - bytes.length).fill(0)];
    const at = pool;
    pool += bytes.length;
    values.push(...bytes);
    return [...le16(tag), ...le16(type), ...le32(count), ...le32(at)];
  };
  const out = [...header];
  const lists = [
    ifd0.map((t) => (t[1] === 4 && t[2] === 1 && pointers.includes(t) ? [t[0], 4, 1, le32(starts[1 + t[3]])] : t)),
    ...subs.map(([, l]) => l),
  ];
  lists.forEach((list) => {
    out.push(...le16(list.length));
    for (const [tag, type, count, bytes] of list) out.push(...entry(tag, type, count, bytes));
    out.push(0, 0, 0, 0);
  });
  return [...out, ...values];
}

/** A JPEG with the segments given as `{ marker, body }`, then a start of scan. */
export function jpegWith(segments) {
  const out = [0xff, 0xd8];
  for (const { marker, body } of segments) out.push(0xff, marker, ...be16(body.length + 2), ...body);
  return Uint8Array.from([...out, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
}

/** The Exif segment of a JPEG. */
export const exifSegment = (opts) => ({ marker: 0xe1, body: [...ascii('Exif\0\0'), ...exif(opts)] });

/** An XMP segment holding `xml`. */
export const xmpSegment = (xml) => ({ marker: 0xe1, body: [...ascii('http://ns.adobe.com/xap/1.0/\0'), ...utf8(xml)] });

/** An IPTC segment with a title, a caption and keywords. */
export function iptcSegment({ title, caption, keywords = [] }) {
  const rec = (n, s) => [0x1c, 2, n, ...be16(utf8(s).length), ...utf8(s)];
  const data = [
    ...(title ? rec(5, title) : []),
    ...keywords.flatMap((k) => rec(25, k)),
    ...(caption ? rec(120, caption) : []),
  ];
  return {
    marker: 0xed,
    body: [
      ...ascii('Photoshop 3.0\0'),
      ...ascii('8BIM'),
      ...be16(0x0404),
      0,
      0,
      ...be32(data.length),
      ...data,
      ...(data.length % 2 ? [0] : []),
    ],
  };
}

/** A PNG with text chunks: `[keyword, text]` pairs as tEXt, and an XMP packet as iTXt. */
export function pngWith({ text = [], xmp } = {}) {
  const chunk = (type, body) => [...be32(body.length), ...ascii(type), ...body, 0, 0, 0, 0];
  const out = [0x89, ...ascii('PNG\r\n\u001a\n'), ...chunk('IHDR', [...be32(2), ...be32(2), 8, 2, 0, 0, 0])];
  for (const [k, v] of text) out.push(...chunk('tEXt', [...ascii(k), 0, ...ascii(v)]));
  if (xmp) out.push(...chunk('iTXt', [...ascii('XML:com.adobe.xmp'), 0, 0, 0, 0, 0, ...utf8(xmp)]));
  out.push(...chunk('IDAT', [0]), ...chunk('IEND', []));
  return Uint8Array.from(out);
}

/** A WebP with an XMP chunk. */
export function webpWith(xml) {
  const body = utf8(xml);
  const chunk = [...ascii('XMP '), ...le32(body.length), ...body, ...(body.length % 2 ? [0] : [])];
  return Uint8Array.from([...ascii('RIFF'), ...le32(4 + chunk.length), ...ascii('WEBP'), ...chunk]);
}

/** An XMP packet with a title, a description, keywords and a date. */
export const xmpPacket = ({ title, description, keywords = [], date }) =>
  `<x:xmpmeta><rdf:RDF><rdf:Description exif:DateTimeOriginal="${date ?? ''}">` +
  (title ? `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title>` : '') +
  (description
    ? `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${description}</rdf:li></rdf:Alt></dc:description>`
    : '') +
  `<dc:subject><rdf:Bag>${keywords.map((k) => `<rdf:li>${k}</rdf:li>`).join('')}</rdf:Bag></dc:subject>` +
  '</rdf:Description></rdf:RDF></x:xmpmeta>';
