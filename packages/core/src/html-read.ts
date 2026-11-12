// Reading an HTML file safely (editor spec §67, format_html_sandboxed and format_untrusted_files; Roger, 25 Oct 2026).
// An HTML file is never run. It is read here as text by a small reader of our own (format_text_first). It is never
// handed to a browser's parser, so nothing in it can run, load or send anything:
// - script, style, template, iframe, object, embed and the like are dropped whole, their contents too;
// - a form, its inputs and buttons are left inert: their words are text, nothing more;
// - an image or a link is never fetched: only its address is read, as words.
// What it gives:
// - `htmlAsText`: the page as plain text, for showing it inert, with what was dropped named;
// - `htmlToGql`: its headings and links as GQL, with the page as one thing. Each heading sits under the one before it
//   of a higher level. Each link is from the heading it sits under. Every statement cites its line in the file.
// A page larger than the limit is refused, saying why. Host-free and pure.
import { quoted } from './lock.ts';
import { word } from './words.ts';

/** The largest HTML file read, in characters. Past it the page is refused, never read in part. */
export const HTML_MOST = 2_000_000;

/** Elements dropped whole, their contents too: each could run, load or embed something. */
const DROPPED = [
  'script',
  'style',
  'template',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'noscript',
  'svg',
  'math',
  'applet',
];
/** Elements whose words are kept but that do nothing: a form and what it holds. */
const INERT = ['form', 'input', 'button', 'select', 'textarea', 'option'];

/** The named character references the reader knows; any other `&name;` is left as written. */
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Text with its character references read: named, decimal and hexadecimal. A control character becomes a space. */
function decoded(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, ref: string) => {
    if (ref[0] !== '#') return NAMED[ref.toLowerCase()] ?? all;
    const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    if (!Number.isFinite(code) || code < 0x20 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return ' ';
    return String.fromCodePoint(code);
  });
}

/** Words on one line: runs of whitespace made one space, trimmed. */
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The line of `at` in `html`, from 1. */
const lineAt = (html: string, at: number) => html.slice(0, at).split('\n').length;

/** One heading or link found, with where it is. */
interface Found {
  kind: 'heading' | 'link';
  level?: number;
  text: string;
  href?: string;
  line: number;
}

/** What a page holds once read: its title, headings and links in order, and what was dropped. */
export interface HtmlRead {
  title: string;
  found: Found[];
  /** The text of the page, inert. */
  text: string;
  /** The elements dropped, by name, each once, in the order first met. */
  dropped: string[];
}

/** The value of attribute `name` in a start tag's text, if it has one. */
function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? decoded(m[1] ?? m[2] ?? m[3] ?? '') : undefined;
}

/** An HTML page read as text: never run, never fetched from. Refused when it is larger than the limit. */
export function readHtml(html: string): HtmlRead | { refused: string } {
  if (html.length > HTML_MOST) return { refused: word('html.too-large', { most: String(HTML_MOST) }) };
  const dropped: string[] = [];
  // comments and declarations go first, so nothing in them is read as a tag
  let src = html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, (c) => ' '.repeat(c.length))
    .replace(/<![^>]*>/g, (c) => ' '.repeat(c.length));
  for (const el of DROPPED) {
    const re = new RegExp(`<${el}\\b[\\s\\S]*?(?:<\\/${el}\\s*>|$)`, 'gi');
    src = src.replace(re, (c) => {
      if (!dropped.includes(el)) dropped.push(el);
      return c.replace(/[^\n]/g, ' '); // kept the same length and lines, so lines are cited as in the file
    });
  }
  for (const el of INERT) if (new RegExp(`<${el}\\b`, 'i').test(src) && !dropped.includes(el)) dropped.push(el);
  const title = oneLine(decoded(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(src)?.[1]?.replace(/<[^>]*>/g, '') ?? ''));
  const found: Found[] = [];
  const tag = /<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/gi;
  let open: { kind: 'heading' | 'link'; level?: number; href?: string; at: number; from: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(src))) {
    const [all, close, rawName, rest] = m;
    const name = (rawName ?? '').toLowerCase();
    const heading = /^h([1-6])$/.exec(name);
    if (!close && (heading || name === 'a') && !open) {
      const href = name === 'a' ? attr(rest ?? '', 'href') : undefined;
      open = {
        kind: heading ? 'heading' : 'link',
        ...(heading ? { level: Number(heading[1]) } : {}),
        ...(href !== undefined ? { href } : {}),
        at: m.index,
        from: m.index + all.length,
      };
      continue;
    }
    if (
      close &&
      open &&
      ((open.kind === 'heading' && name === `h${open.level}`) || (open.kind === 'link' && name === 'a'))
    ) {
      const text = oneLine(decoded(src.slice(open.from, m.index).replace(/<[^>]*>/g, ' ')));
      if (open.kind === 'heading' || open.href !== undefined)
        found.push({
          kind: open.kind,
          ...(open.level !== undefined && { level: open.level }),
          text,
          ...(open.href !== undefined && { href: open.href }),
          line: lineAt(html, open.at),
        });
      open = null;
    }
  }
  const body =
    /<body\b[^>]*>([\s\S]*?)(?:<\/body\s*>|$)/i.exec(src)?.[1] ?? src.replace(/<head\b[\s\S]*?<\/head\s*>/i, '');
  const text = decoded(
    body.replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, '\n').replace(/<[^>]*>/g, ' '),
  )
    .split('\n')
    .map(oneLine)
    .filter(Boolean)
    .join('\n');
  return { title, found, text, dropped };
}

/** The page as text to show, inert, with a first line naming what was dropped or left inert; or why it is refused. */
export function htmlAsText(html: string): { text: string; dropped: string[] } | { refused: string } {
  const r = readHtml(html);
  if ('refused' in r) return r;
  const head = r.dropped.length ? [word('html.dropped', { what: r.dropped.join(', ') })] : [];
  return { text: [...head, r.text].join('\n'), dropped: r.dropped };
}

/** A name for GQL from words: letters, digits and underscores, starting with a letter. */
const keyOf = (prefix: string, n: number) => `${prefix}${n}`;

/**
 * The headings and links of a page as a GQL block named `graph`, or why it is refused. Each statement cites its line
 * in `place`, the file. The page is one Page thing. Each heading is IN the one before it of a higher level, or in the
 * page. Each link is from the heading it sits under, or the page. Nothing is fetched: an address is a property.
 */
export function htmlToGql(html: string, graph: string, place: string): string | { refused: string } {
  const r = readHtml(html);
  if ('refused' in r) return r;
  const cite = (line: number) => quoted(`${place}#L${line}`);
  const lines = [`// graph: ${graph}`, `(page:Page {title: ${quoted(r.title || place)}, source: ${quoted(place)}})`];
  const stack: { key: string; level: number }[] = [];
  let h = 0,
    l = 0;
  for (const f of r.found) {
    if (f.kind === 'heading') {
      const level = f.level ?? 1;
      while (stack.length && (stack.at(-1)?.level ?? 0) >= level) stack.pop();
      const key = keyOf('h', ++h);
      const parent = stack.at(-1)?.key ?? 'page';
      lines.push(`(${key}:Heading {text: ${quoted(f.text)}, level: ${level}, cites: ${cite(f.line)}})`);
      lines.push(`(${key})-[:IN]->(${parent})`);
      stack.push({ key, level });
    } else {
      const key = keyOf('l', ++l);
      const from = stack.at(-1)?.key ?? 'page';
      lines.push(`(${key}:Link {text: ${quoted(f.text)}, href: ${quoted(f.href ?? '')}, cites: ${cite(f.line)}})`);
      lines.push(`(${from})-[:LINKS]->(${key})`);
    }
  }
  return [lines[0], ...lines.slice(1).map((x, i, all) => (i < all.length - 1 ? `${x},` : x))].join('\n');
}
