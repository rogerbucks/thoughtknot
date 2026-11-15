// The Exif block of an image (editor spec §18, image_meta_first): a small TIFF file inside the image. It gives the
// description a camera or an editor wrote, the date taken, Windows' own title, comment and keywords, and where it was
// taken. Each read is held to the bytes there. Each pointer is followed once, and at most MOST_ENTRIES entries of a
// directory are looked at. So a block that loops or lies is read as far as it is true.
import { cutText, latin1, META_MOST, utf16le, utf8, withoutEndZeros } from './image-meta-text.ts';

/** What an Exif block says of its image. */
export interface ExifMeta {
  title?: string;
  caption?: string;
  keywords: string[];
  date?: string;
  /** Where it was taken, in degrees, south and west negative. */
  place?: { lat: number; lon: number };
}

/** The most entries of one directory looked at. */
const MOST_ENTRIES = 512;

/** A cursor on the TIFF bytes that reads in the byte order the header gives. */
function reader(b: Uint8Array) {
  const little = b[0] === 0x49 && b[1] === 0x49;
  const u16 = (at: number) =>
    at + 2 <= b.length ? (little ? b[at]! | (b[at + 1]! << 8) : (b[at]! << 8) | b[at + 1]!) : 0;
  const u32 = (at: number) =>
    at + 4 <= b.length
      ? (little
          ? b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)
          : (b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0
      : 0;
  return { u16, u32 };
}

/** One directory entry: its tag, type, count and where its value's bytes are (inline when they fit in four). */
interface Entry {
  tag: number;
  type: number;
  count: number;
  at: number;
}

/** The size in bytes of a TIFF value type; 0 for one not known. */
const SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

/** The bytes of an Exif text: Windows' UTF-16 when a byte list, else the ASCII a camera wrote, read as UTF-8. */
function textOf(b: Uint8Array, e: Entry): string {
  const bytes = b.subarray(e.at, Math.min(b.length, e.at + e.count * (SIZE[e.type] || 1)));
  const s = e.type === 1 ? utf16le(bytes) : utf8(bytes);
  return withoutEndZeros(s);
}

/** The entries of the directory at `at`. */
function entries(b: Uint8Array, at: number): Entry[] {
  const { u16, u32 } = reader(b);
  const n = Math.min(u16(at), MOST_ENTRIES);
  const out: Entry[] = [];
  for (let i = 0; i < n; i++) {
    const e = at + 2 + i * 12;
    if (e + 12 > b.length) break;
    const type = u16(e + 2),
      count = u32(e + 4),
      size = (SIZE[type] ?? 0) * count;
    if (size === 0) continue;
    const place = size <= 4 ? e + 8 : u32(e + 8);
    if (place + size > b.length) continue;
    out.push({ tag: u16(e), type, count, at: place });
  }
  return out;
}

/** A GPS coordinate: three rationals (degrees, minutes, seconds) and the reference letter that signs it. */
function degrees(b: Uint8Array, e: Entry | undefined, ref: Entry | undefined, minus: string): number | undefined {
  if (!e || e.type !== 5 || e.count !== 3) return undefined;
  const { u32 } = reader(b);
  const part = (i: number) => {
    const d = u32(e.at + i * 8 + 4);
    return d === 0 ? NaN : u32(e.at + i * 8) / d;
  };
  const v = part(0) + part(1) / 60 + part(2) / 3600;
  if (!Number.isFinite(v) || v > 180) return undefined;
  const sign = String.fromCharCode(b[ref?.at ?? 0] ?? 0) === minus ? -1 : 1;
  return Math.round(sign * v * 1e5) / 1e5;
}

/** `2024:05:01 10:20:30` as `2024-05-01T10:20:30`; undefined when it is not a date. */
const exifDate = (s: string): string | undefined => {
  const m = /^(\d{4}):(\d{2}):(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?/.exec(s);
  return m && m[2] !== '00' ? `${m[1]}-${m[2]}-${m[3]}${m[4] ? `T${m[4]}:${m[5]}:${m[6]}` : ''}` : undefined;
};

/** What the TIFF bytes of an Exif block say of its image; nothing, for bytes that are no TIFF. */
export function readExif(b: Uint8Array): ExifMeta {
  const none: ExifMeta = { keywords: [] };
  const little = b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a;
  if (!little && !(b[0] === 0x4d && b[1] === 0x4d && b[3] === 0x2a)) return none;
  const { u32 } = reader(b);
  const root = entries(b, u32(4));
  const find = (list: Entry[], tag: number) => list.find((e) => e.tag === tag);
  const named = (tag: number) => {
    const e = find(root, tag);
    return e ? cutText(textOf(b, e), tag === 0x9c9c ? META_MOST.caption : META_MOST.title) : undefined;
  };
  const sub = (tag: number) => {
    const e = find(root, tag);
    return e ? entries(b, u32(e.at)) : [];
  };
  const taken = find(sub(0x8769), 0x9003);
  const gps = sub(0x8825);
  const lat = degrees(b, find(gps, 2), find(gps, 1), 'S'),
    lon = degrees(b, find(gps, 4), find(gps, 3), 'W');
  const keys = find(root, 0x9c9e);
  const title = named(0x9c9b) ?? named(0x010e);
  const caption = named(0x9c9c);
  const date = taken ? exifDate(latin1(b.subarray(taken.at, taken.at + Math.min(taken.count, 19)))) : undefined;
  return {
    ...(title && { title }),
    ...(caption && { caption }),
    keywords: keys
      ? utf16le(b.subarray(keys.at, keys.at + keys.count))
          .split(';')
          .flatMap((k) => cutText(k, META_MOST.keyword) ?? [])
      : [],
    ...(date && { date }),
    ...(lat !== undefined && lon !== undefined && { place: { lat, lon } }),
  };
}
