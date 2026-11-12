// Composing a graph out into a document (editor spec §67, format_compose_out and format_loss_stated; Roger, 25 Oct
// 2026). The data an export holds (export-data.ts) is written as Markdown, HTML or a Word file, for a person to read.
// It has a heading for the graph, a part for each thing with its kinds and properties, then its links. Composing is an
// export (export_one_way): it reads the graph and never changes it, and the person chooses where the file goes.
// - Each says what it left out: the look, where things sit, drawings and what your AI found. A document also holds
//   values as words, so it does not read back as the same graph. GQL, CSV and GraphML are the lossless exports.
// - HTML is inert (format_html_sandboxed): no script, no style or image fetched, a policy that forbids both.
// - Word is written with no library (format_text_first): its XML parts in a stored zip of our own (zip-write.ts).
// Host-free and pure.
import type { Value } from '@thoughtknot/graph-spec';
import { saidDate } from './export-frame.ts';
import { kindOf, numberText, timeText } from './export-data-model.ts';
import type { DataInfo, ExportedData } from './export-data-model.ts';
import { word } from './words.ts';
import { utf8 } from './ai-digest.ts';
import { zipStored } from './zip-write.ts';

/** A text as UTF-8 bytes. */
const bytesOf = (s: string): Uint8Array => Uint8Array.from(utf8(s));

/** The formats a graph is composed into. */
export const COMPOSE_FORMATS = ['md', 'html', 'docx'] as const;
/** One format a graph is composed into. */
export type ComposeFormat = (typeof COMPOSE_FORMATS)[number];

/** Whether `format` is one a graph is composed into, rather than an image's or the data's. */
export const isComposeFormat = (format: string): format is ComposeFormat =>
  (COMPOSE_FORMATS as readonly string[]).includes(format);

/** A composed document: its file's extension and media type, its body, and what it left out, in words. */
export interface Composed {
  extension: string;
  mime: string;
  body: string | Uint8Array;
  leftOut: string[];
}

/** One thing as a document shows it: its title, kinds, properties as words, and its note. */
interface Part {
  id: string;
  title: string;
  kinds: string[];
  props: [string, string][];
  note?: string;
}

/** A value as a person reads it: a day as a date, an instant in UTC, true and false as yes and no. */
function said(v: Value): string {
  const kind = kindOf(v);
  if (kind === 'text') return v as string;
  if (kind === 'number') return numberText(v as number);
  if (kind === 'boolean') return word(v ? 'compose.yes' : 'compose.no');
  const t = v as { kind: 'date' | 'datetime'; s: string };
  return kind === 'date' ? saidDate(t.s) : timeText(t);
}

/** The keys a thing is titled by, first found first. */
const TITLES = ['name', 'title', 'label'];

/** The parts of the data: each thing, titled by its name where it has one, else its id. */
function partsOf(data: ExportedData): { parts: Part[]; titleOf: Map<string, string> } {
  const notes = new Map(data.notes?.things ?? []);
  const titleOf = new Map<string, string>();
  const parts = data.things.map(([id, kinds, props]): Part => {
    const key = TITLES.find((k) => typeof props[k] === 'string' && props[k].trim());
    const title = key ? (props[key] as string) : id;
    titleOf.set(id, title);
    const shown = Object.entries(props).filter(([k, v]) => k !== key && !(k === 'id' && v === id));
    const note = notes.get(id);
    return { id, title, kinds, props: shown.map(([k, v]) => [k, said(v)]), ...(note !== undefined && { note }) };
  });
  return { parts, titleOf };
}

/** Each link as words: its from, its type, its to and its properties. */
function linksOf(data: ExportedData, titleOf: Map<string, string>) {
  return data.links.map(([from, type, to, props]) => ({
    from: titleOf.get(from) ?? from,
    type,
    to: titleOf.get(to) ?? to,
    props: Object.entries(props).map(([k, v]): [string, string] => [k, said(v)]),
  }));
}

/** What every composed document leaves out, in words: the reader is told so at its top (format_loss_stated). */
export const leftOutOf = (): string[] => [
  word('compose.left-look'),
  word('compose.left-places'),
  word('compose.left-drawings'),
  word('compose.left-ai'),
  word('compose.left-kinds'),
];

/** The line at the top of a document: where it came from, and what it left out. */
const fromLine = (info: DataInfo, leftOut: string[]) =>
  word('compose.from', { note: info.note, date: saidDate(info.date), left: leftOut.join(', ') });

// Markdown: every character Markdown could take as a mark is escaped, so a name never becomes a heading or a link
const md = (s: string) => s.replace(/[\\`*_[\]<>#|]/g, (c) => `\\${c}`).replace(/[\r\n]+/g, ' ');

/** The data as Markdown. */
export function composeMarkdown(data: ExportedData, info: DataInfo): string {
  const { parts, titleOf } = partsOf(data);
  const out = [`# ${md(data.view ?? data.graph)}`, '', `_${md(fromLine(info, leftOutOf()))}_`];
  if (parts.length) out.push('', `## ${word('compose.things')}`);
  for (const p of parts) {
    out.push('', `### ${md(p.title)}`);
    if (p.kinds.length) out.push('', `_${p.kinds.map(md).join(', ')}_`);
    if (p.props.length) out.push('', ...p.props.map(([k, v]) => `- ${md(k)}: ${md(v)}`));
    if (p.note !== undefined) out.push('', `> ${md(p.note)}`);
  }
  const links = linksOf(data, titleOf);
  if (links.length) out.push('', `## ${word('compose.links')}`, '');
  for (const l of links) {
    const more = l.props.length ? ` (${l.props.map(([k, v]) => `${md(k)}: ${md(v)}`).join(', ')})` : '';
    out.push(`- ${md(l.from)} **${md(l.type)}** ${md(l.to)}${more}`);
  }
  return `${out.join('\n')}\n`;
}

const MARKS: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Text escaped for HTML or XML, so it is only ever text. */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => MARKS[c] ?? c);

/** The data as one HTML page that runs nothing and fetches nothing. */
export function composeHtml(data: ExportedData, info: DataInfo): string {
  const { parts, titleOf } = partsOf(data);
  const title = esc(data.view ?? data.graph);
  const body = [`<h1>${title}</h1>`, `<p><em>${esc(fromLine(info, leftOutOf()))}</em></p>`];
  if (parts.length) body.push(`<h2>${esc(word('compose.things'))}</h2>`);
  for (const p of parts) {
    body.push(`<section id="${esc(p.id)}">`, `<h3>${esc(p.title)}</h3>`);
    if (p.kinds.length) body.push(`<p><em>${esc(p.kinds.join(', '))}</em></p>`);
    if (p.props.length)
      body.push(`<dl>${p.props.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`);
    if (p.note !== undefined) body.push(`<blockquote>${esc(p.note)}</blockquote>`);
    body.push('</section>');
  }
  const links = linksOf(data, titleOf);
  if (links.length) {
    body.push(`<h2>${esc(word('compose.links'))}</h2>`, '<ul>');
    for (const l of links) {
      const more = l.props.length ? ` (${esc(l.props.map(([k, v]) => `${k}: ${v}`).join(', '))})` : '';
      body.push(`<li>${esc(l.from)} <strong>${esc(l.type)}</strong> ${esc(l.to)}${more}</li>`);
    }
    body.push('</ul>');
  }
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    // nothing may run, load or be sent from this page, wherever it is opened
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'">`,
    `<title>${title}</title>`,
    '</head>',
    '<body>',
    ...body,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** One Word paragraph, in a style when given one, its text kept as written, spaces too. */
const wp = (text: string, style?: string) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;

/** The styles a composed Word file uses: its title and two levels of heading, each Word's own name for them. */
const STYLES = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>',
  ...[
    ['Title', 'Title', 48],
    ['Heading1', 'heading 1', 32],
    ['Heading2', 'heading 2', 26],
  ].map(
    ([id, name, size]) =>
      `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="${id === 'Title' ? 0 : id === 'Heading1' ? 0 : 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`,
  ),
  '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:rPr><w:i/></w:rPr></w:style>',
  '</w:styles>',
].join('');

/** The data as a Word file: its document, styles and the parts that tie them, in a zip. */
export function composeDocx(data: ExportedData, info: DataInfo): Uint8Array {
  const { parts, titleOf } = partsOf(data);
  const paras = [wp(data.view ?? data.graph, 'Title'), wp(fromLine(info, leftOutOf()), 'Quote')];
  if (parts.length) paras.push(wp(word('compose.things'), 'Heading1'));
  for (const p of parts) {
    paras.push(wp(p.title, 'Heading2'));
    if (p.kinds.length) paras.push(wp(p.kinds.join(', '), 'Quote'));
    for (const [k, v] of p.props) paras.push(wp(`${k}: ${v}`));
    if (p.note !== undefined) paras.push(wp(p.note, 'Quote'));
  }
  const links = linksOf(data, titleOf);
  if (links.length) paras.push(wp(word('compose.links'), 'Heading1'));
  for (const l of links) {
    const more = l.props.length ? ` (${l.props.map(([k, v]) => `${k}: ${v}`).join(', ')})` : '';
    paras.push(wp(`${l.from} ${l.type} ${l.to}${more}`));
  }
  const wordNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const relsNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const xml = (s: string) => bytesOf(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${s}`);
  return zipStored([
    {
      path: '[Content_Types].xml',
      bytes: xml(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
          '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
          '</Types>',
      ),
    },
    {
      path: '_rels/.rels',
      bytes: xml(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          `<Relationship Id="rId1" Type="${relsNs}/officeDocument" Target="word/document.xml"/>` +
          '</Relationships>',
      ),
    },
    {
      path: 'word/_rels/document.xml.rels',
      bytes: xml(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          `<Relationship Id="rId1" Type="${relsNs}/styles" Target="styles.xml"/>` +
          '</Relationships>',
      ),
    },
    {
      path: 'word/document.xml',
      bytes: xml(`<w:document xmlns:w="${wordNs}"><w:body>${paras.join('')}</w:body></w:document>`),
    },
    { path: 'word/styles.xml', bytes: bytesOf(STYLES) },
  ]);
}

/** The data composed in `format`: never a change to the graph, always saying what it left out. */
export function composeOut(data: ExportedData, format: ComposeFormat, info: DataInfo): Composed {
  const leftOut = leftOutOf();
  if (format === 'md') return { extension: 'md', mime: 'text/markdown', body: composeMarkdown(data, info), leftOut };
  if (format === 'html') return { extension: 'html', mime: 'text/html', body: composeHtml(data, info), leftOut };
  return {
    extension: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    body: composeDocx(data, info),
    leftOut,
  };
}
