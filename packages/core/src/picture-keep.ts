// Keeping a picture beside a note on a host that has no vault of its own (editor spec ES§45, board_images_kept). The
// browser page's server and the VS Code tab hold the same rules, so they are here, host-free. A picture is read by its
// first bytes alone: PNG, JPEG, GIF or WebP, never SVG, whatever its name or type says. It is at most eight million
// bytes. It is kept in a folder named `attachments` beside the note, under a name no file has, so nothing is overwritten.

/** The most bytes a picture kept beside a note may hold. */
export const PICTURE_MOST_BYTES = 8_000_000;

/** The folder beside a note that its pictures are kept in. */
export const PICTURE_FOLDER = 'attachments';

/** The most bytes of the request that carries a picture: its base64, in a few words of JSON. */
export const PICTURE_BODY_LIMIT = Math.ceil((PICTURE_MOST_BYTES * 4) / 3) + 4096;

/** The kinds of picture kept, by the ending each is kept with. */
export type PictureEnding = 'png' | 'jpg' | 'gif' | 'webp';

/** What a picture's first bytes say it is. */
export interface PictureKind {
  ending: PictureEnding;
  type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
}

const startsWith = (bytes: Uint8Array, at: number, ...marks: number[]): boolean =>
  marks.every((m, i) => bytes[at + i] === m);

/** The kind of picture `bytes` start as, or null when they are not a PNG, JPEG, GIF or WebP. */
export function pictureKind(bytes: Uint8Array): PictureKind | null {
  if (startsWith(bytes, 0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { ending: 'png', type: 'image/png' };
  if (startsWith(bytes, 0, 0xff, 0xd8, 0xff)) return { ending: 'jpg', type: 'image/jpeg' };
  if (startsWith(bytes, 0, 0x47, 0x49, 0x46, 0x38) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61)
    return { ending: 'gif', type: 'image/gif' };
  // RIFF, four bytes of size, then WEBP
  if (startsWith(bytes, 0, 0x52, 0x49, 0x46, 0x46) && startsWith(bytes, 8, 0x57, 0x45, 0x42, 0x50))
    return { ending: 'webp', type: 'image/webp' };
  return null;
}

/** The names Windows keeps for its devices. */
const DEVICE = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/** The most characters of a kept name's stem. */
const STEM_MOST = 80;

/**
 * The stem a picture is kept under, from the name it came with. Its own ending is left off. Only letters, digits,
 * dashes and underscores are kept. A name with none of those is `picture`. It is never a path or hidden.
 */
export function pictureStem(given: string): string {
  const last = given.split(/[\\/]/).pop() ?? '';
  const dot = last.lastIndexOf('.');
  const bare = dot > 0 ? last.slice(0, dot) : last;
  let stem = '';
  for (const c of bare)
    stem += (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' ? c : '-';
  // dashes made of anything else run together and sit inside the name, not at its ends
  const parts = stem.split('-').filter((p) => p !== '');
  const joined = parts.join('-').slice(0, STEM_MOST);
  if (joined === '') return 'picture';
  // Windows reads CON, NUL and the like as devices, whatever their ending: such a stem is given a word before it
  return DEVICE.test(joined) ? `picture-${joined}` : joined;
}

/** The name a picture is kept under on its `n`th try: `plan.png`, then `plan-2.png`. */
export const pictureName = (stem: string, ending: PictureEnding, n: number): string =>
  `${stem}${n > 1 ? `-${n}` : ''}.${ending}`;

/** Whether `name` is a name a kept picture has: a stem of the kept marks, one dot, and one of the four endings. */
export function isKeptName(name: string): boolean {
  const dot = name.lastIndexOf('.');
  if (dot < 1 || name.length > STEM_MOST + 12) return false;
  const ending = name.slice(dot + 1);
  if (!['png', 'jpg', 'gif', 'webp'].includes(ending)) return false;
  return [...name.slice(0, dot)].every(
    (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '-',
  );
}
