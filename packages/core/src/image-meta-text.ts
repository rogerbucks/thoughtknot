// Plain text out of an image's metadata (editor spec §18, image_meta_first). What a file says of itself is the file's
// words, never ours: it is cleaned, cut to a length and never read as an instruction. The core runs where there is no
// text decoder, so UTF-8 and UTF-16 are read here by hand. A byte that is no text is left out, never thrown.

/** The most characters of a title, of a caption or description, and of one keyword, and the most keywords kept. */
export const META_MOST = { title: 200, caption: 1000, keyword: 60, keywords: 30 } as const;

/** Text with control characters turned to spaces, white space made single, and the ends trimmed. */
export function cleaned(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    out += c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029 ? ' ' : ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** `s` without the zero characters that end it. */
export function withoutEndZeros(s: string): string {
  let end = s.length;
  while (end > 0 && s.charCodeAt(end - 1) === 0) end--;
  return s.slice(0, end);
}

/** `s` cleaned and cut to `most` characters; undefined when nothing is left. */
export function cutText(s: string, most: number): string | undefined {
  const c = cleaned(s);
  return c ? (c.length > most ? c.slice(0, most) : c) : undefined;
}

/** UTF-8 bytes as text: each bad byte is one replacement character, so a hostile file never throws. */
export function utf8(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length;) {
    const c = b[i++] ?? 0;
    const need = c < 0x80 ? 0 : c >= 0xf0 ? 3 : c >= 0xe0 ? 2 : c >= 0xc0 ? 1 : -1;
    if (need < 0) {
      out += '�';
      continue;
    }
    let cp = need === 0 ? c : c & (0x3f >> need);
    let ok = true;
    for (let k = 0; k < need; k++) {
      const n = b[i] ?? 0;
      if ((n & 0xc0) !== 0x80) {
        ok = false;
        break;
      }
      cp = (cp << 6) | (n & 0x3f);
      i++;
    }
    out += ok && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '�';
  }
  return out;
}

/** UTF-16 little-endian bytes as text, as Windows writes a title or keywords; a stray odd byte is left out. */
export function utf16le(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i + 1 < b.length; i += 2) out += String.fromCharCode((b[i] ?? 0) | ((b[i + 1] ?? 0) << 8));
  return withoutEndZeros(out);
}

/** Latin-1 bytes as text: one byte, one character. */
export const latin1 = (b: Uint8Array): string => [...b].map((c) => String.fromCharCode(c)).join('');
