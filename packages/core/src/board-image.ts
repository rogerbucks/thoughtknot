// Pictures and notes brought onto a board (editor spec ES§45, board_images). A picture dropped or pasted is kept by
// the host as an attachment of the note. The board holds only its link: an Image item with `src`, its name as its
// text. A note dropped or pasted becomes a card that links to it. Host-free: the host says what was brought.
//
// Only a picture kept beside the notes is ever shown. A link to the web is never loaded, so a board sends nothing
// out by being opened.
import type { BoardItem } from './board.ts';

/** The most room a new picture takes on the board; a larger one is made smaller, its shape kept. */
export const IMAGE_MOST = { w: 320, h: 240 };
/** The size a picture is given when its own size cannot be read. */
const IMAGE_PLAIN = { w: 200, h: 150 };

/** The link an Image item shows, or null when it holds none. */
export const imageSrc = (item: BoardItem): string | null =>
  item.kind === 'Image' && typeof item.more.src === 'string' && item.more.src ? item.more.src : null;

/**
 * Whether a picture's link is to a file kept beside the notes: a path, with no scheme and no host. Only such a link
 * is shown. Anything else, such as a link to the web or data written into the link, is left as its name.
 */
export function isLocalSrc(src: string): boolean {
  return !hasScheme(src) && !src.startsWith('//') && !UNSAFE.some((c) => src.includes(c));
}

/** The marks a link kept in a board may not hold: they would break out of the picture it is drawn into. */
const UNSAFE = ['<', '>', '"', '\n', '\r', '\t'];

/** Whether the one character `c`, in lower case, is a letter of the alphabet. */
const isLetter = (c: string): boolean => c >= 'a' && c <= 'z';
/** Whether the one character `c`, in lower case, is a letter or a digit. */
const isLetterOrDigit = (c: string): boolean => isLetter(c) || (c >= '0' && c <= '9');

/** Whether every character of `text` is a letter or a digit, and there is at least one. Read character by character. */
function isAlnum(text: string): boolean {
  if (!text) return false;
  for (const c of text.toLowerCase()) if (!isLetterOrDigit(c)) return false;
  return true;
}

/** Whether `src` starts with a scheme, as `https:` or `data:` does: a letter, then letters, digits, `+`, `.` or `-`. */
function hasScheme(src: string): boolean {
  const low = src.toLowerCase();
  if (!isLetter(low.charAt(0))) return false;
  for (let i = 1; i < low.length; i++) {
    const c = low.charAt(i);
    if (c === ':') return true;
    if (!isLetterOrDigit(c) && c !== '+' && c !== '.' && c !== '-') return false;
  }
  return false;
}

/** The last part of a path, without its ending: the name a picture or a note is said by. */
export function nameOf(path: string): string {
  const last = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  const dot = last.lastIndexOf('.');
  return (dot >= 0 && isAlnum(last.slice(dot + 1)) ? last.slice(0, dot) : last) || last;
}

/**
 * A new Image item as `id`, its middle at the spot `at`, for the picture kept at `src`. `natural` is the picture's own
 * size, when known. It is shown no larger than IMAGE_MOST, in its own shape, in whole numbers.
 */
export function imageItem(
  id: string,
  src: string,
  at: [number, number],
  natural?: { w: number; h: number } | null,
): BoardItem {
  const own = natural && natural.w > 0 && natural.h > 0 ? natural : IMAGE_PLAIN;
  const by = Math.min(1, IMAGE_MOST.w / own.w, IMAGE_MOST.h / own.h);
  const w = Math.max(1, Math.round(own.w * by)),
    h = Math.max(1, Math.round(own.h * by));
  const x = Math.round(at[0] - w / 2),
    y = Math.round(at[1] - h / 2);
  return { id, kind: 'Image', x, y, w, h, text: nameOf(src), more: { src } };
}

/** A new Card item as `id`, its middle at the spot `at`, that names the note at `path` and links to it. */
export function noteCard(id: string, path: string, at: [number, number]): BoardItem {
  const [w, h] = [200, 120];
  const link = path.toLowerCase().endsWith('.md') ? path.slice(0, -3) : path;
  const x = Math.round(at[0] - w / 2),
    y = Math.round(at[1] - h / 2);
  return { id, kind: 'Card', x, y, text: nameOf(path), more: { links: link } };
}

/** The most characters a dropped or pasted text may hold and still be read as the link to a note. */
export const LINK_MOST = 1024;

/**
 * The note a dropped or pasted text names, or null when it names none. It reads a wiki link `[[Note]]`, a path that
 * ends in `.md`, and the link Obsidian gives a note dragged from its list. An alias or a heading is left out.
 */
export function noteLinkOf(text: string): string | null {
  const t = text.trim();
  if (!t || t.length > LINK_MOST || t.includes('\n')) return null;
  const inner = t.startsWith('!') ? t.slice(1) : t;
  if (inner.startsWith('[[') && inner.endsWith(']]') && !inner.slice(2, -2).includes(']')) {
    // the note's own name: what comes before a `|` (its shown words) or a `#` (a heading in it)
    const name = inner.slice(2, -2).split('|')[0]?.split('#')[0] ?? '';
    if (name) return name.trim() || null;
  }
  if (t.toLowerCase().startsWith('obsidian://open?')) {
    const file = t
      .slice(t.indexOf('?') + 1)
      .split('&')
      .find((part) => part.startsWith('file=') && part.length > 'file='.length);
    try {
      return file ? decodeURIComponent(file.slice('file='.length)) : null;
    } catch {
      return null;
    }
  }
  return isLocalSrc(t) && t.toLowerCase().endsWith('.md') ? t : null;
}

/** Whether a file is a picture a board shows, by its type: a drawing or a photo, never a document. */
export const isPicture = (type: string): boolean => /^image\/(png|jpeg|gif|webp|svg\+xml|avif|bmp)$/i.test(type);
