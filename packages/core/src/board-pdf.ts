// A PDF of pictures, one to a page, written in plain JavaScript (editor spec ES§45, board_exchange). Our own writer:
// no library, no WebAssembly and no network.
// - Each page holds one JPEG picture, kept as the bytes the host made: a PDF holds a JPEG as it is.
// - A page is the picture's natural size, at 96 pixels to the inch, and never larger than a PDF page may be.
// - Loss stated: the page is a picture, so its words cannot be chosen or read aloud. The title names the board.

/** One page of the PDF: a JPEG picture, its size in pixels, and its natural size in CSS pixels. */
export interface PdfPage {
  jpeg: Uint8Array;
  pixels: { width: number; height: number };
  width: number;
  height: number;
}

// the largest side a PDF page may have, in points
const MOST_POINTS = 14_400;

/** Text as a PDF holds it: UTF-16 with its mark first, written in hex, so any language is kept. */
function pdfText(s: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

/** The bytes of text that holds only ASCII. */
const ascii = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0x7f);

/** The PDF that holds `pages`, each a picture on a page of its own, with `title` as the document's title. */
export function picturesPdf(pages: readonly PdfPage[], title: string): Uint8Array {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const put = (part: Uint8Array | string) => {
    const bytes = typeof part === 'string' ? ascii(part) : part;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (n: number, head: string, stream?: Uint8Array) => {
    offsets[n] = length;
    put(`${n} 0 obj\n${head}\n`);
    if (stream) {
      put('stream\n');
      put(stream);
      put('\nendstream\n');
    }
    put('endobj\n');
  };
  // objects 1 to 3 are the catalogue, the list of pages and the title; each page then takes three
  const pageId = (i: number) => 4 + i * 3;
  put('%PDF-1.4\n%\x7f\x7f\x7f\x7f\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  object(3, `<< /Title ${pdfText(title)} /Producer ${pdfText('ThoughtKnot')} >>`);
  for (const [i, page] of pages.entries()) {
    const id = pageId(i);
    // 96 CSS pixels to the inch is 0.75 points to the pixel; a page too large for a PDF is made smaller to fit
    const fit = Math.min(1, MOST_POINTS / (page.width * 0.75), MOST_POINTS / (page.height * 0.75));
    const [w, h] = [page.width * 0.75 * fit, page.height * 0.75 * fit].map((v) =>
      Math.max(1, Math.round(v * 100) / 100),
    );
    const draw = ascii(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`);
    object(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`,
    );
    object(
      id + 1,
      `<< /Type /XObject /Subtype /Image /Width ${page.pixels.width} /Height ${page.pixels.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>`,
      page.jpeg,
    );
    object(id + 2, `<< /Length ${draw.length} >>`, draw);
  }
  const count = 4 + pages.length * 3;
  const xref = length;
  put(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) put(`${String(offsets[n] ?? 0).padStart(10, '0')} 00000 n \n`);
  put(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
