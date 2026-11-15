// The XMP packet of an image (editor spec §18, image_meta_first): the XML that Adobe's tools and most phones write. Its
// title, description, keywords and date are found by looking for their elements one after another. It is never parsed
// as a whole. No entity is expanded past the five plain ones, and a hostile packet costs one pass over its bytes.
import { cutText, META_MOST } from './image-meta-text.ts';

/** What an XMP packet says of its image. */
export interface XmpMeta {
  title?: string;
  caption?: string;
  keywords: string[];
  date?: string;
}

/** The longest packet read, in characters; a longer one is read as far as this. */
export const XMP_MOST = 262_144;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** XML text with its five plain entities and numeric references read; any other entity is left as written. */
export function unescapedXml(s: string): string {
  return s.replace(
    /&(?:#(\d{1,7})|#x([0-9a-fA-F]{1,6})|(amp|lt|gt|quot|apos));/g,
    (m: string, d?: string, h?: string, n?: string) => {
      if (n) return ENTITIES[n] ?? m;
      const cp = d ? parseInt(d, 10) : parseInt(h ?? '', 16);
      return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : m;
    },
  );
}

/** Text with every tag left out, one pass over its characters; a stray `<` or `>` is left out too, so no tag can remain. */
function withoutTags(s: string): string {
  let out = '',
    inTag = false;
  for (const c of s) {
    if (c === '<') inTag = true;
    else if (c === '>') inTag = false;
    else if (!inTag) out += c;
  }
  return out;
}

/** The text of every `<rdf:li>` inside the first `<name>` element, in order; the whole element's text when it has none. */
function listIn(xml: string, name: string): string[] {
  const open = xml.indexOf(`<${name}`);
  if (open < 0) return [];
  const bodyAt = xml.indexOf('>', open);
  const end = xml.indexOf(`</${name}>`, open);
  if (bodyAt < 0 || end < 0 || end < bodyAt) return [];
  const body = xml.slice(bodyAt + 1, end);
  const out: string[] = [];
  for (let at = body.indexOf('<rdf:li'); at >= 0 && out.length < 200; at = body.indexOf('<rdf:li', at + 1)) {
    const from = body.indexOf('>', at),
      to = body.indexOf('</rdf:li>', at);
    if (from < 0 || to < 0 || to < from) break;
    // a language alternative: the default (x-default) is the one asked for, else the first
    out.push(`${/xml:lang="x-default"/.test(body.slice(at, from)) ? '\u0001' : ''}${body.slice(from + 1, to)}`);
  }
  if (out.length === 0) return [withoutTags(body)];
  return out;
}

/** The first text of a language alternative, the default one when there is one; the texts are in unescaped form. */
const pick = (texts: string[]): string => texts.find((t) => t.startsWith('\u0001'))?.slice(1) ?? texts[0] ?? '';

/** A value written as an attribute of the description, `name="…"`. */
const attribute = (xml: string, name: string): string | undefined => {
  const at = xml.indexOf(` ${name}="`);
  if (at < 0) return undefined;
  const from = at + name.length + 3,
    to = xml.indexOf('"', from);
  return to < 0 ? undefined : xml.slice(from, to);
};

/** A date as XMP writes it (`2024-05-01T10:20:30+10:00`), cut to its date and time without a zone; undefined if none. */
export function xmpDate(s: string | undefined): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec((s ?? '').trim());
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}${m[4] ? `T${m[4]}:${m[5]}:${m[6] ?? '00'}` : ''}`;
}

/** What an XMP packet's text says: title, description, keywords and the date taken. Anything it lacks is left out. */
export function readXmp(packet: string): XmpMeta {
  const xml = packet.length > XMP_MOST ? packet.slice(0, XMP_MOST) : packet;
  const title = cutText(unescapedXml(pick(listIn(xml, 'dc:title'))), META_MOST.title);
  const caption = cutText(unescapedXml(pick(listIn(xml, 'dc:description'))), META_MOST.caption);
  const keywords = listIn(xml, 'dc:subject').flatMap((k) => {
    const t = cutText(unescapedXml(k.replace('\u0001', '')), META_MOST.keyword);
    return t ? [t] : [];
  });
  const date =
    xmpDate(attribute(xml, 'exif:DateTimeOriginal') ?? listIn(xml, 'exif:DateTimeOriginal')[0]) ??
    xmpDate(attribute(xml, 'photoshop:DateCreated') ?? listIn(xml, 'photoshop:DateCreated')[0]);
  return { ...(title && { title }), ...(caption && { caption }), keywords, ...(date && { date }) };
}
