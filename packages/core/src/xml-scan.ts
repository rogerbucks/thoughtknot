// XML scanned into tokens, in plain JavaScript (ES§63 connector_files_to_gql, ES§67 format_untrusted_files).
// - Only the five named entities and numeric ones are put back. Nothing else is ever expanded.
// - A document type is refused, since it could expand into more than the file holds.
import { Damaged } from './zip-read.ts';

// ---- the XML --------------------------------------------------------------------------------------------------

/** One piece of XML: a tag opening (with its attributes), a tag closing, or text. */
export type Tok = { open: string; attrs: Record<string, string>; shut: boolean } | { close: string } | { text: string };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Text with its five named and its numeric entities put back; nothing else is ever expanded. */
function unescape(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-z]{2,4});/g, (m, e: string) => {
    if (e.startsWith('#')) {
      const n = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n < 0xe000) ? String.fromCodePoint(n) : '';
    }
    return ENTITIES[e] ?? m;
  });
}

/** The name without its prefix: `x:row` and `row` are both `row`. */
const local = (n: string) => n.slice(n.indexOf(':') + 1);

/** A tag's name and attributes from the text between `<` and `>`; an attribute's prefix is dropped as a tag's is. */
function tagOf(inner: string): Tok {
  if (inner.startsWith('/')) return { close: local(inner.slice(1).trim()) };
  const shut = inner.endsWith('/');
  const body = shut ? inner.slice(0, -1) : inner;
  let i = 0;
  while (i < body.length && !/\s/.test(body[i] ?? '')) i++;
  const attrs: Record<string, string> = {};
  for (;;) {
    while (i < body.length && /\s/.test(body[i] ?? '')) i++;
    const eq = body.indexOf('=', i);
    if (eq < 0) break;
    const name = local(body.slice(i, eq).trim());
    let q = eq + 1;
    while (q < body.length && /\s/.test(body[q] ?? '')) q++;
    const quote = body[q];
    const stop = quote === '"' || quote === "'" ? body.indexOf(quote, q + 1) : -1;
    if (stop < 0) throw new Damaged();
    attrs[name] = unescape(body.slice(q + 1, stop));
    i = stop + 1;
  }
  return { open: local(body.slice(0, body.search(/\s|$/)).trim()), attrs, shut };
}

/** The XML as tokens. A document type, which could expand into more than the file holds, is refused. */
export function* tokens(xml: string): Generator<Tok> {
  let i = 0;
  while (i < xml.length) {
    if (xml[i] !== '<') {
      const j = xml.indexOf('<', i);
      yield { text: unescape(xml.slice(i, j < 0 ? xml.length : j)) };
      i = j < 0 ? xml.length : j;
    } else if (xml.startsWith('<![CDATA[', i)) {
      const j = xml.indexOf(']]>', i);
      if (j < 0) throw new Damaged();
      yield { text: xml.slice(i + 9, j) };
      i = j + 3;
    } else if (xml.startsWith('<?', i) || xml.startsWith('<!--', i)) {
      const end = xml.startsWith('<?', i) ? '?>' : '-->';
      const j = xml.indexOf(end, i);
      if (j < 0) throw new Damaged();
      i = j + end.length;
    } else if (xml.startsWith('<!', i)) throw new Damaged();
    else {
      let j = i + 1;
      for (let quote = ''; j < xml.length; j++) {
        const c = xml[j];
        if (quote) quote = c === quote ? '' : quote;
        else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
      }
      if (j >= xml.length) throw new Damaged();
      const t = tagOf(xml.slice(i + 1, j));
      yield t;
      if ('open' in t && t.shut) yield { close: t.open };
      i = j + 1;
    }
  }
}
