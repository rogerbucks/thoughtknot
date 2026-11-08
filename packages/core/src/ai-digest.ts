// The digest a send to an AI is recorded by (editor spec §19, record_every_send): SHA-256 (FIPS 180-4) of the text sent,
// as UTF-8, in hexadecimal; and its size in bytes. The record keeps these and never the text, so it can show that what
// was sent was a given text without holding the note's content. Written here, as the core has no host's library.

/** The text as UTF-8 bytes. */
export function utf8(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    // a lone surrogate has no UTF-8 form: it is sent as U+FFFD, the replacement character, as every encoder sends it
    const at = ch.codePointAt(0) ?? 0;
    const c = at >= 0xd800 && at <= 0xdfff ? 0xfffd : at;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/** The size of the text in bytes, as UTF-8. */
export const utf8Size = (text: string): number => utf8(text).length;

// the first 32 bits of the fractional parts of the cube roots of the first 64 primes
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
];

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** The text as UTF-8 bytes in an array of `size` bytes, with room after them. As utf8, but quick on a huge note. */
function utf8Into(text: string, size: number): Uint8Array {
  const out = new Uint8Array(size);
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) out[n++] = c;
    else if (c < 0x800) {
      out[n++] = 0xc0 | (c >> 6);
      out[n++] = 0x80 | (c & 63);
    } else if (c < 0x10000) {
      out[n++] = 0xe0 | (c >> 12);
      out[n++] = 0x80 | ((c >> 6) & 63);
      out[n++] = 0x80 | (c & 63);
    } else {
      out[n++] = 0xf0 | (c >> 18);
      out[n++] = 0x80 | ((c >> 12) & 63);
      out[n++] = 0x80 | ((c >> 6) & 63);
      out[n++] = 0x80 | (c & 63);
    }
  }
  return out;
}

/** The size of the text in bytes as UTF-8, without making the bytes. */
function utf8Length(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        n += 4;
        i++;
      } else n += 3;
    } else n += 3;
  }
  return n;
}

// the last text digested and its digest: a huge note is often digested several times in a row as it is opened
let last: { text: string; digest: string } | null = null;

/** SHA-256 of the text, as UTF-8, in sixty-four lowercase hexadecimal digits. */
export function sha256(text: string): string {
  if (last?.text === text) return last.digest;
  const digest = digestOf(text);
  last = { text, digest };
  return digest;
}

/** The SHA-256 rounds over the text's padded bytes. */
function digestOf(text: string): string {
  const length = utf8Length(text);
  const padded = Math.ceil((length + 9) / 64) * 64;
  const bytes = utf8Into(text, padded);
  bytes[length] = 0x80;
  // the length in bits, as a 64-bit big-endian number: a text sent is far below 2^53 bits
  const bits = length * 8;
  const view = new DataView(bytes.buffer);
  view.setUint32(padded - 8, Math.floor(bits / 0x100000000));
  view.setUint32(padded - 4, bits >>> 0);
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const k = Uint32Array.from(K);
  for (let at = 0; at < padded; at += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(at + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!,
        d = w[i - 2]!;
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3),
        s1 = rotr(d, 17) ^ rotr(d, 19) ^ (d >>> 10);
      w[i] = w[i - 16]! + s0 + w[i - 7]! + s1;
    }
    let a = h[0]!,
      b = h[1]!,
      c = h[2]!,
      d = h[3]!,
      e = h[4]!,
      f = h[5]!,
      g = h[6]!,
      hh = h[7]!;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + k[i]! + w[i]!) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((v, i) => (h[i] = (h[i] ?? 0) + v));
  }
  return Array.from(h, (v) => v.toString(16).padStart(8, '0')).join('');
}
