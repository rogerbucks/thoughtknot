// What an image's own metadata says of it (editor spec §18, image_meta_first; Roger, 15 Nov 2026: read the picture's
// own title, caption, keywords, date and place before any AI is asked). They are read from where each format keeps them.
// A JPEG has Exif, XMP and IPTC segments. A PNG has text chunks and an Exif chunk. A WebP has Exif and XMP chunks. No
// library is used and nothing is decoded. A file cut short or written wrongly is read as far as it goes. What it says is
// the file's words, cleaned and cut (image-meta-text.ts), never an instruction.
import { readExif } from './image-meta-exif.ts';
import type { ExifMeta } from './image-meta-exif.ts';
import { cutText, latin1, META_MOST, utf8 } from './image-meta-text.ts';
import { readXmp, xmpDate } from './image-meta-xmp.ts';

/** What an image says of itself. Each part is left out when the file does not say it. */
export interface ImageMeta {
  title?: string;
  /** A caption or description. */
  caption?: string;
  keywords: string[];
  /** The date taken, `2024-05-01` or with the time, no zone. */
  date?: string;
  /** Where it was taken, in degrees. */
  place?: { lat: number; lon: number };
}

/** The most segments or chunks looked at in one file. */
const MOST_PARTS = 512;

const starts = (b: Uint8Array, at: number, s: string): boolean =>
  b.length >= at + s.length && [...s].every((c, i) => b[at + i] === c.charCodeAt(0));
const be16 = (b: Uint8Array, at: number) => ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0);
const be32 = (b: Uint8Array, at: number) => (be16(b, at) * 65536 + be16(b, at + 2)) >>> 0;
const le32 = (b: Uint8Array, at: number) =>
  ((b[at] ?? 0) | ((b[at + 1] ?? 0) << 8) | ((b[at + 2] ?? 0) << 16) | ((b[at + 3] ?? 0) << 24)) >>> 0;

/** The IPTC records of a Photoshop block: object name (2:5), keywords (2:25) and caption (2:120). */
function readIptc(b: Uint8Array): Partial<ImageMeta> {
  const out: Partial<ImageMeta> & { keywords: string[] } = { keywords: [] };
  let at = starts(b, 0, 'Photoshop 3.0\0') ? 14 : 0;
  for (let n = 0; at + 12 <= b.length && n < MOST_PARTS && starts(b, at, '8BIM'); n++) {
    const id = be16(b, at + 4);
    const nameLen = (b[at + 6] ?? 0) + 1;
    const nameEnd = at + 6 + nameLen + (nameLen % 2 ? 1 : 0);
    const size = be32(b, nameEnd);
    const data = b.subarray(nameEnd + 4, Math.min(b.length, nameEnd + 4 + size));
    if (id === 0x0404)
      for (let p = 0; p + 5 <= data.length;) {
        const len = be16(data, p + 3);
        if (data[p] !== 0x1c) break;
        const text = utf8(data.subarray(p + 5, p + 5 + len));
        if (data[p + 1] === 2 && data[p + 2] === 5) out.title = cutText(text, META_MOST.title);
        if (data[p + 1] === 2 && data[p + 2] === 120) out.caption = cutText(text, META_MOST.caption);
        if (data[p + 1] === 2 && data[p + 2] === 25) {
          const k = cutText(text, META_MOST.keyword);
          if (k) out.keywords.push(k);
        }
        p += 5 + len;
      }
    at = nameEnd + 4 + size + (size % 2);
  }
  return out;
}

/** The pieces of an image's metadata a container gave, each as bytes: `exif`, `xmp`, `iptc` and PNG's `text` pairs. */
interface Parts {
  exif: Uint8Array[];
  xmp: string[];
  iptc: Uint8Array[];
  text: [string, string][];
}

/** A JPEG's segments, up to the start of its scan. */
function jpegParts(b: Uint8Array, out: Parts): void {
  let at = 2;
  for (let n = 0; at + 4 <= b.length && n < MOST_PARTS && b[at] === 0xff; n++) {
    const marker = b[at + 1] ?? 0;
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0xff) {
      at++;
      continue;
    }
    const len = be16(b, at + 2);
    const body = b.subarray(at + 4, Math.min(b.length, at + 2 + len));
    if (marker === 0xe1 && starts(body, 0, 'Exif\0\0')) out.exif.push(body.subarray(6));
    else if (marker === 0xe1 && starts(body, 0, 'http://ns.adobe.com/xap/1.0/\0'))
      out.xmp.push(utf8(body.subarray(29)));
    else if (marker === 0xed) out.iptc.push(body);
    at += 2 + Math.max(len, 2);
  }
}

/** A PNG's chunks: plain and international text, and the Exif chunk. Compressed text is not read, as nothing inflates here. */
function pngParts(b: Uint8Array, out: Parts): void {
  let at = 8;
  for (let n = 0; at + 12 <= b.length && n < MOST_PARTS; n++) {
    const len = be32(b, at);
    const body = b.subarray(at + 8, Math.min(b.length, at + 8 + len));
    if (starts(b, at + 4, 'IDAT')) break;
    const zero = body.indexOf(0);
    if (starts(b, at + 4, 'tEXt') && zero > 0)
      out.text.push([latin1(body.subarray(0, zero)), latin1(body.subarray(zero + 1))]);
    else if (starts(b, at + 4, 'iTXt') && zero > 0 && body[zero + 1] === 0) {
      // keyword, 0, compression flag, method, language, 0, translated keyword, 0, then the text
      let p = zero + 3;
      for (let skip = 0; skip < 2 && p < body.length; skip++) p = body.indexOf(0, p) + 1 || body.length;
      out.text.push([latin1(body.subarray(0, zero)), utf8(body.subarray(p))]);
    } else if (starts(b, at + 4, 'eXIf')) out.exif.push(body);
    at += 12 + len;
  }
}

/** A WebP's chunks: Exif and XMP. */
function webpParts(b: Uint8Array, out: Parts): void {
  let at = 12;
  for (let n = 0; at + 8 <= b.length && n < MOST_PARTS; n++) {
    const size = le32(b, at + 4);
    const body = b.subarray(at + 8, Math.min(b.length, at + 8 + size));
    if (starts(b, at, 'EXIF')) out.exif.push(starts(body, 0, 'Exif\0\0') ? body.subarray(6) : body);
    else if (starts(b, at, 'XMP ')) out.xmp.push(utf8(body));
    at += 8 + size + (size % 2);
  }
}

/** The first of each thing a list of metadata gives: earlier sources win, and keywords are joined without repeats. */
function merged(all: (Partial<ImageMeta> | ExifMeta)[]): ImageMeta {
  const first = <K extends 'title' | 'caption' | 'date' | 'place'>(k: K) => all.find((m) => m[k] !== undefined)?.[k];
  const keywords = [...new Set(all.flatMap((m) => m.keywords ?? []))].slice(0, META_MOST.keywords);
  const [title, caption, date, place] = [first('title'), first('caption'), first('date'), first('place')];
  return {
    ...(title && { title }),
    ...(caption && { caption }),
    keywords,
    ...(date && { date }),
    ...(place && { place }),
  };
}

/**
 * What the image's own metadata says: title, caption, keywords, date taken and place. Where the sources differ, XMP wins,
 * then IPTC, then Exif (the order editors write them in). Bytes of no known format, or with none, give no parts.
 */
export function imageMetadata(bytes: Uint8Array): ImageMeta {
  const parts: Parts = { exif: [], xmp: [], iptc: [], text: [] };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) jpegParts(bytes, parts);
  else if (bytes[0] === 0x89 && starts(bytes, 1, 'PNG\r\n\u001a\n')) pngParts(bytes, parts);
  else if (starts(bytes, 0, 'RIFF') && starts(bytes, 8, 'WEBP')) webpParts(bytes, parts);
  const text = (name: string) => parts.text.find(([k]) => k === name)?.[1];
  for (const [k, v] of parts.text) if (k === 'XML:com.adobe.xmp') parts.xmp.push(v);
  const own: Partial<ImageMeta> = {
    title: cutText(text('Title') ?? '', META_MOST.title),
    caption: cutText(text('Description') ?? '', META_MOST.caption),
    date: xmpDate(text('Creation Time')),
    keywords: [],
  };
  return merged([
    ...parts.xmp.map(readXmp),
    ...parts.iptc.map(readIptc),
    ...parts.exif.map(readExif),
    ...(parts.text.length ? [own] : []),
  ]);
}

/**
 * Whether the metadata says enough that no AI need be asked: a title, and a caption or keywords (image_meta_first).
 * Date and place alone never do, since they say when and where, not what.
 */
export const metaCovers = (m: ImageMeta): boolean => !!m.title && (!!m.caption || m.keywords.length > 0);
