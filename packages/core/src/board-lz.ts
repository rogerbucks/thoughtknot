// Text packed the LZ-String way, unpacked in plain JavaScript (editor spec ES§45, board_exchange). The Obsidian
// Excalidraw plugin packs a drawing so, as Base64 text, inside its note. Our own code: no library, no WebAssembly.
// - Read-only: it only unpacks.
// - Untrusted: text that is not packed so gives null, and so does text that unpacks to more than `most` characters.
const KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

/** Thrown when the packed text ends early or names what it never held; turned into null at the edge. */
class Damaged extends Error {}

/** The bits of the packed text, six to a character, read a few at a time, lowest first. */
function bitReader(packed: string): (count: number) => number {
  let [index, value, position] = [0, 0, 0];
  return (count) => {
    let bits = 0;
    for (let power = 0; power < count; power++) {
      if (!position) {
        if (index >= packed.length) throw new Damaged();
        value = KEYS.indexOf(packed[index++] ?? '');
        if (value < 0) throw new Damaged();
        position = 32;
      }
      if (value & position) bits |= 1 << power;
      position >>= 1;
    }
    return bits;
  };
}

/**
 * The text that `packed` holds, where `packed` is Base64 as LZ-String writes it; line breaks in it are passed over.
 * Null when it is not packed so, or when it unpacks to more than `most` characters.
 */
export function unpackedLz(packed: string, most: number): string | null {
  const read = bitReader(packed.replace(/\s+/g, ''));
  // the first three entries stand for: a character of 8 bits, a character of 16 bits, and the end
  const words: string[] = ['', '', ''];
  let [width, room, size] = [3, 4, 0];
  const out: string[] = [];
  let last = '';
  const grown = () => {
    if (--room === 0) room = 2 ** width++;
  };
  try {
    // the first code is two bits wide, and is always a character or the end
    const first = read(2);
    if (first === 2) return '';
    if (first > 2) return null;
    last = String.fromCharCode(read(first ? 16 : 8));
    words.push(last);
    out.push(last);
    for (;;) {
      let code = read(width);
      if (code === 2) return out.join('');
      if (code < 2) {
        words.push(String.fromCharCode(read(code ? 16 : 8)));
        code = words.length - 1;
        grown();
      }
      // a code one past the last entry is the word being made now: the last word and its own first character
      const entry = code === words.length ? last + last.charAt(0) : words[code];
      if (!entry) return null;
      out.push(entry);
      size += entry.length;
      if (size > most) return null;
      words.push(last + entry.charAt(0));
      grown();
      last = entry;
    }
  } catch (e) {
    if (e instanceof Damaged) return null;
    throw e;
  }
}
