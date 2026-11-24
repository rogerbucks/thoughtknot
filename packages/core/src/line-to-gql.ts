// Loose lines to GQL (editor spec §47, line_to_gql_code and line_to_gql_checked). A person may type a line in a graph
// block in any format. A line the library cannot read is a loose line, and code converts its common shapes into GQL,
// with no AI and no network:
// - an arrow (A -> B, A --> B, A -likes-> B, A -->|likes| B, A -- likes --> B, A <- B, mermaid's A[Alice] --> B[Bob]);
// - a sentence (A likes B, or Bob works at Acme where the graph has WORKS_AT, or "Bob Smith" knows "Carol");
// - a thing and its kind (A is a Person, A: Person, A (Person)); a list (A, B, C, or A, B: Person); a list item (- A);
// - properties of a new thing (A.key = value, A: key = value, k = v); a Markdown table row or a CSV row.
// Names, kinds and link types the graph has are reused, by any name a thing goes by (text_to_graph_merge). The result
// is read in its place in the note by the graph format library before it is offered. A result that fails, or adds a
// problem, is refused with the reason. The note is left as it is (text_to_graph_checked).
import gs from '@thoughtknot/graph-spec';
import { gqlBlocks, gqlSpans, graphOfBlock } from './blocks.ts';
import type { Span } from './blocks.ts';
import { readNote } from './drawing.ts';
import { quoted } from './lock.ts';
import { NameBook } from './name-book.ts';
import { newProblems } from './proposals-apply.ts';
import { knownThings } from './text-to-graph.ts';
import type { KnownThing } from './text-to-graph.ts';
import { word } from './words.ts';

/** A line of a graph block the library cannot read: its 0-based line in the note, its words, its graph and indent. */
export interface LooseLine {
  line: number;
  text: string;
  graph: string;
  indent: string;
}

/** Which shape of line code found. */
export type LineShape = 'arrow' | 'sentence' | 'kind' | 'list' | 'item' | 'properties' | 'table' | 'csv';

/** A converted line: its GQL, one element a line, and the note with it in place; or why there is none. */
export type LineConverted = { gql: string; note: string; shape?: LineShape } | { refused: string };

const WORD = /^[A-Za-z_]\w*$/;
const HIDDEN = new Set<string>(gs.SCHEMA_LABELS);
/** A name as two names are compared: its letters and digits alone, in lower case. */
const same = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const lead = (s: string) => /^\s*/.exec(s)?.[0] ?? '';

/** The block a 0-based line of the note is inside, between its fences. */
const spanAt = (note: string, line: number): Span | undefined =>
  gqlSpans(note).find((s) => s.open < line && line < s.close);

/**
 * The loose line at 0-based `line` of the note, or null. A loose line is in a data block with a graph line. It is not
 * blank or a comment. The library's first fault in the block is on it, and the line alone cannot be read either.
 */
export function looseLine(note: string, line: number): LooseLine | null {
  const span = spanAt(note, line);
  const graph = span ? graphOfBlock(span.text) : null;
  if (!span || !graph) return null;
  const raw = note.split('\n')[line] ?? '';
  const text = raw.trim();
  if (!text || text.startsWith('//')) return null;
  const fault = gs.checkSyntax(span.text);
  if (!fault || fault.line !== line - span.open) return null;
  if (!gs.checkSyntax(`// graph: ${graph}\n${text.replace(/,\s*$/, '')}`)) return null;
  return { line, text, graph, indent: lead(raw) };
}

/** One end of a link or one thing, as the line says it: its words, and a kind and properties when the line gives them. */
interface Said {
  text: string;
  kind?: string;
  props?: [string, string][];
}

/** What a line says: things, and links between them by a type in words. */
interface Read {
  shape: LineShape;
  things: Said[];
  links: [Said, string, Said][];
}

/** What the graph has, to reuse: its things by every name, its kinds and its link types. */
interface Has {
  known: KnownThing[];
  kinds: string[];
  types: string[];
}

// a name a person types for a thing: letters, digits and a few marks, at most five words (three in a list)
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} '’.&_-]*$/u;
const nameOk = (s: string, most = 5) => NAME.test(s) && s.length <= 200 && s.split(/\s+/).length <= most;
const unquote = (s: string) =>
  s
    .trim()
    .replace(/^["'“‘](.*)["'”’]$/u, '$1')
    .trim();

/** Mermaid's node, A[Alice] or A(Alice) or A((Alice)) or A{Alice}: its text. Any other end is its words. */
function endOf(s: string): string {
  const t = s.trim().replace(/;$/, '');
  const m = /^\w+\s*[[({]+\s*(.+?)\s*[\])}]+$/.exec(t);
  return unquote(m ? (m[1] ?? '') : t);
}

const ARROWS: [RegExp, boolean][] = [
  [/^(.+?)\s*-{1,2}>?\s*\|\s*([^|]+?)\s*\|\s*(.+)$/, false], // A -->|likes| B
  [/^(.+?)\s+-{1,2}\s+(.+?)\s+-{1,2}>\s*(.+)$/, false], // A -- likes --> B
  [/^(.+?)\s*-\[\s*:?\s*([^\]]+?)\s*\]->\s*(.+)$/, false], // A -[likes]-> B
  [/^(.+?)\s+-{1,2}([A-Za-z_][\w ]*?)-{1,2}>\s*(.+)$/, false], // A -likes-> B, A --likes--> B
  [/^(.+?)\s*(?:-{1,2}>|=>|→|⟶|—>)\s*(.+)$/, false], // A -> B
  [/^(.+?)\s*(?:<-{1,2}|←)\s*(.+)$/, true], // A <- B
];

/** An arrow between two things, labelled or not; or null. */
function arrowOf(line: string): Read | null {
  for (const [re, back] of ARROWS) {
    const m = re.exec(line);
    if (!m) continue;
    const parts = m.slice(1);
    const [a, b] = [endOf(parts[0] ?? ''), endOf(parts[parts.length - 1] ?? '')];
    const type = parts.length === 3 ? (parts[1] ?? '').trim() : '';
    if (!nameOk(a, 8) || !nameOk(b, 8)) return null;
    const [from, to] = back ? [b, a] : [a, b];
    return { shape: 'arrow', things: [], links: [[{ text: from }, type, { text: to }]] };
  }
  return null;
}

/** A sentence of a subject, a verb and an object: split by a link type the graph has, by quotes, or three words. */
function sentenceOf(line: string, has: Has): Read | null {
  const link = (a: string, type: string, b: string): Read | null =>
    nameOk(a, 8) && nameOk(b, 8) ? { shape: 'sentence', things: [], links: [[{ text: a }, type, { text: b }]] } : null;
  const q = /^["“](.+?)["”]\s+(.+?)\s+["“](.+?)["”]$/u.exec(line);
  if (q) return link(q[1] ?? '', q[2] ?? '', q[3] ?? '');
  const words = line.split(/\s+/);
  for (let i = 1; i < words.length - 1; i++)
    for (let j = words.length - 1; j > i; j--) {
      const verb = words.slice(i, j).join(' ');
      if (has.types.some((t) => same(t) === same(verb)))
        return link(words.slice(0, i).join(' '), verb, words.slice(j).join(' '));
    }
  const [a, verb, b] = words;
  if (words.length === 3 && a && b && verb && /^[\p{Ll}_]+$/u.test(verb)) return link(a, verb, b);
  return null;
}

const KINDS: RegExp[] = [
  /^(.+?)\s+(?:is|are)\s+(?:a|an)\s+([A-Za-z][\w ]*)$/i, // A is a Person
  /^(.+?)\s*:\s*([A-Za-z][\w ]*)$/, // A: Person
  /^(.+?)\s*\(\s*([A-Za-z][\w ]*)\s*\)$/, // A (Person)
];

/** A thing and its kind; or null. */
function kindOf(line: string): Read | null {
  for (const re of KINDS) {
    const m = re.exec(line);
    const [text, kind] = [unquote(m?.[1] ?? ''), (m?.[2] ?? '').trim()];
    if (m && nameOk(text) && kind.split(/\s+/).length <= 3)
      return { shape: 'kind', things: [{ text, kind }], links: [] };
  }
  return null;
}

/** key = value pairs, parted by commas; null unless every part is one. */
function pairsOf(s: string): [string, string][] | null {
  const pairs = s.split(',').map((p) => /^\s*([A-Za-z_]\w*)\s*[=:]\s*(.+?)\s*$/.exec(p));
  return pairs.every((p) => p) ? pairs.map((p) => [p?.[1] ?? '', p?.[2] ?? '']) : null;
}

/** Properties of a thing: A.key = value, or A: key = value, k = v; or null. */
function propertiesOf(line: string): Read | null {
  const dot = /^(.+?)\.([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(line);
  const colon = /^(.+?)\s*:\s*([A-Za-z_]\w*\s*=.+)$/.exec(line);
  const text = unquote((dot ?? colon)?.[1] ?? '');
  const props = dot ? [[dot[2] ?? '', dot[3] ?? ''] as [string, string]] : colon ? pairsOf(colon[2] ?? '') : null;
  if (!props || !nameOk(text)) return null;
  return { shape: 'properties', things: [{ text, props }], links: [] };
}

/** A list of things, with a kind for them all after a colon; or null. */
function listOf(line: string): Read | null {
  const kinded = /^(.+,.+?)\s*:\s*([A-Za-z][\w ]*)$/.exec(line);
  const names = (kinded?.[1] ?? line).split(',').map(unquote);
  const kind = kinded?.[2]?.trim();
  if (names.length < 2 || !names.every((n) => nameOk(n, 3))) return null;
  return { shape: 'list', things: names.map((text) => (kind ? { text, kind } : { text })), links: [] };
}

/** Cells as a row says them: a link of three, a thing and its kind of two, a thing of one; or null. */
function cellsOf(cells: string[], shape: LineShape): Read | null {
  const [a = '', b = '', c = ''] = cells;
  if (cells.length === 3 && nameOk(a, 8) && nameOk(c, 8) && b)
    return { shape, things: [], links: [[{ text: a }, b, { text: c }]] };
  if (cells.length === 2 && nameOk(a)) return { shape, things: [{ text: a, kind: b }], links: [] };
  if (cells.length === 1 && nameOk(a)) return { shape, things: [{ text: a }], links: [] };
  return null;
}

/** A Markdown table row; or null. A rule row (|---|---|) says nothing and is null too. */
function tableOf(line: string): Read | null {
  const m = /^\|(.+)\|\s*$/.exec(line);
  if (!m) return null;
  const cells = (m[1] ?? '').split('|').map((c) => unquote(c));
  if (cells.every((c) => /^:?-{2,}:?$/.test(c))) return null;
  return cellsOf(cells, 'table');
}

/** A CSV row of three with a link type in the middle: one in capitals, or one the graph has; or null. */
function csvOf(line: string, has: Has): Read | null {
  const cells = line.split(',').map(unquote);
  const type = cells[1] ?? '';
  if (cells.length !== 3 || !(/^[A-Z][A-Z0-9_]*$/.test(type) || has.types.some((t) => same(t) === same(type))))
    return null;
  return cellsOf(cells, 'csv');
}

/** What the line says, by the first shape that fits; or null. */
function readLine(line: string, has: Has): Read | null {
  // a mermaid header names no thing
  if (/^(?:graph|flowchart)\s+(?:TD|TB|BT|LR|RL)\b/i.test(line)) return null;
  const item = /^(?:[-*+•]|\d+[.)])\s+(.+)$/.exec(line);
  if (item) {
    const inner = item[1]?.trim() ?? '';
    const read = readLine(inner, has);
    if (read) return read;
    return nameOk(inner) ? { shape: 'item', things: [{ text: unquote(inner) }], links: [] } : null;
  }
  return (
    tableOf(line) ??
    arrowOf(line) ??
    csvOf(line, has) ??
    propertiesOf(line) ??
    kindOf(line) ??
    listOf(line) ??
    sentenceOf(line, has) ??
    (nameOk(line, 2) ? { shape: 'item', things: [{ text: unquote(line) }], links: [] } : null)
  );
}

/** A kind in the graph's spelling when it has it, else its words joined, each starting with a capital. */
function kindNamed(kind: string, has: Has): string {
  const old = has.kinds.find((k) => same(k) === same(kind));
  if (old) return old;
  return kind
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join('');
}

/** A link type in the graph's spelling when it has it, else its words in capitals joined by underscores. */
function typeNamed(type: string, has: Has): string {
  if (!type.trim()) return 'RELATES_TO';
  const old = has.types.find((t) => same(t) === same(type));
  if (old) return old;
  return type
    .trim()
    .replace(/^:/, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

/** A property's value as GQL writes it: a number, true or false as they are, anything else quoted. */
function valueOf(v: string): string {
  const t = v.trim();
  if (/^-?\d+(\.\d+)?$/.test(t) || t === 'true' || t === 'false') return t;
  return quoted(unquote(t));
}

/** The GQL elements of what a line says, writing each new thing once; or why there are none. */
function elementsOf(read: Read, has: Has, book: NameBook): string[] | { refused: string } {
  const keys = new Map<string, string>();
  const things: string[] = [];
  const keyOf = (s: Said): string | null => {
    const known = has.known.find((k) => k.names.some((n) => same(n) === same(s.text)));
    const kind = s.kind ? kindNamed(s.kind, has) : '';
    if (kind && !WORD.test(kind)) return null;
    const props = (s.props ?? []).map(([k, v]) => `${k}: ${valueOf(v)}`);
    if (known && !kind && !props.length) return known.key;
    const seen = keys.get(same(s.text));
    if (seen && !kind && !props.length) return seen;
    // a thing the graph has, written again with a kind or properties, is written so the check says why it cannot be
    const key = known?.key ?? book.name(s.text, kind || undefined);
    book.set(key, kind);
    keys.set(same(s.text), key);
    const body = known ? props : [`name: ${quoted(s.text)}`, ...props];
    things.push(`(${key}${kind ? `:${kind}` : ''}${body.length ? ` {${body.join(', ')}}` : ''})`);
    return key;
  };
  for (const t of read.things) if (!keyOf(t)) return { refused: word('line-gql.no-shape') };
  const links: string[] = [];
  for (const [a, type, b] of read.links) {
    const [from, to, t] = [keyOf(a), keyOf(b), typeNamed(type, has)];
    if (!from || !to || !WORD.test(t)) return { refused: word('line-gql.no-shape') };
    links.push(`(${from})-[:${t}]->(${to})`);
  }
  const all = [...things, ...links];
  return all.length ? all : { refused: word('line-gql.nothing-new') };
}

/** The note with 0-based `line` blank: what the graph is without the loose line. */
export function noteWithoutLine(note: string, line: number): string {
  const lines = note.split('\n');
  lines[line] = '';
  return lines.join('\n');
}

/** What the graph of the note has, read without the loose line, to reuse. */
function hasOf(note: string, graph: string): { has: Has; book: NameBook } {
  const reading = readNote(gqlBlocks(note).map((b) => b.text));
  const book = new NameBook();
  const kinds = new Set<string>(),
    types = new Set<string>();
  for (const w of [reading.world[graph], reading.whole[graph]]) {
    for (const [key, [labels]] of w?.nodes ?? []) {
      const kind = [...(labels ?? [])].find((l) => !HIDDEN.has(l)) ?? '';
      book.set(key, kind);
      if (kind) kinds.add(kind);
    }
    for (const e of w?.edges ?? []) types.add(e[1]);
  }
  return { has: { known: knownThings(note, graph), kinds: [...kinds], types: [...types] }, book };
}

/** Whether a line of a block holds GQL: not blank and not a comment. */
const isCode = (s: string | undefined) => !!s?.trim() && !s.trim().startsWith('//');

/**
 * The note with the loose line at 0-based `line` replaced by GQL `elements`, read in its place by the graph format
 * library; or why not. Each element takes the line's indent. They are parted by commas, and the last takes one too when
 * the GQL lines around it use them. It is refused when the block cannot be read, or when the graph gets a problem it did
 * not have without the line.
 */
export function lineWithGql(note: string, line: number, elements: string[]): LineConverted {
  const loose = looseLine(note, line);
  const span = spanAt(note, line);
  if (!loose || !span) return { refused: word('line-gql.not-loose') };
  if (!elements.length) return { refused: word('line-gql.nothing-new') };
  const lines = note.split('\n');
  let before = line - 1;
  while (before > span.open && !isCode(lines[before])) before--;
  const after = lines.slice(line + 1, span.close).some(isCode);
  const tail = after && (lines[before] ?? '').trimEnd().endsWith(',') ? ',' : '';
  const written = elements.map((e, i) => `${loose.indent}${e}${i < elements.length - 1 ? ',' : tail}`);
  const out = [...lines.slice(0, line), ...written, ...lines.slice(line + 1)].join('\n');
  const block = spanAt(out, line);
  const fault = block ? gs.checkSyntax(block.text) : null;
  if (fault) return { refused: word('line-gql.not-read', { why: fault.message }) };
  const without = readNote(gqlBlocks(noteWithoutLine(note, line)).map((b) => b.text));
  const problem = newProblems(without, readNote(gqlBlocks(out).map((b) => b.text)), loose.graph)[0];
  if (problem) return { refused: word('line-gql.problem', { why: problem.message }) };
  return { gql: elements.map((e, i) => (i < elements.length - 1 ? `${e},` : e)).join('\n'), note: out };
}

/**
 * The loose line at 0-based `line`, converted by code with no AI and no network. It gives the GQL and the note with it
 * in place, checked by the library. Or it says why not: the line is not loose, no shape fits, or the check fails.
 */
export function convertLine(note: string, line: number): LineConverted {
  const loose = looseLine(note, line);
  if (!loose) return { refused: word('line-gql.not-loose') };
  const { has, book } = hasOf(noteWithoutLine(note, line), loose.graph);
  const read = readLine(loose.text.replace(/,\s*$/, ''), has);
  if (!read) return { refused: word('line-gql.no-shape') };
  const elements = elementsOf(read, has, book);
  if ('refused' in elements) return elements;
  const placed = lineWithGql(note, line, elements);
  return 'refused' in placed ? placed : { ...placed, shape: read.shape };
}
