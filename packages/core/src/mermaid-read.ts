// A Mermaid block read as things, links and groups (editor spec §67 format_graph_from_data, format_untrusted_files).
// It reads a flowchart (boxes, arrows, subgraphs as groups) and a mindmap (a tree by its indents). Nothing more.
// - Untrusted: nothing in a block is run, and markup in a label is dropped. A block over the limits is refused with its
//   reason, never read in part. A block holding a NUL is no text.
// - Cited: each thing, link and group keeps the line it is written on, so a statement made from it can say where.
// - Loss stated: a line it cannot read, or a style line it leaves out, is listed in `problems` with its line.
// The statements a block gives are made in mermaid-connector.ts, not here.

/** The most a block may hold before it is refused: Mermaid's own default size, and a line count. */
export const MERMAID_LIMITS = { bytes: 50_000, lines: 5_000 };

/** A thing a block draws: a box, or a mindmap node. `group` is the subgraph it was first written in. */
export interface MermaidThing {
  id: string;
  label: string;
  line: number;
  group: string | null;
}
/** An arrow between two ids, with the words on it. A mindmap's link joins a node to its child, with no words. */
export interface MermaidLink {
  from: string;
  to: string;
  label: string;
  line: number;
}
/** A subgraph, and the one it sits in. */
export interface MermaidGroup {
  id: string;
  label: string;
  line: number;
  parent: string | null;
}
/** Why a line was not read: a style line left out, a form not read yet, or a line that is not Mermaid. */
export type MermaidProblemKind = 'ignored' | 'unsupported' | 'unreadable';

/** A block read. */
export interface MermaidRead {
  kind: 'flowchart' | 'mindmap';
  things: MermaidThing[];
  links: MermaidLink[];
  groups: MermaidGroup[];
  problems: { line: number; why: MermaidProblemKind }[];
}
/** Why a block was not read at all. */
export interface MermaidRefusal {
  why: 'too-large' | 'too-many-lines' | 'not-text' | 'unknown-type';
}

/** Text with every tag cut out and any stray angle bracket dropped. Walked by hand, so no pattern can be made to stall. */
function withoutTags(text: string): string {
  let out = '';
  let inTag = false;
  for (const c of text) {
    if (c === '<') inTag = true;
    else if (c === '>') inTag = false;
    else if (!inTag) out += c;
  }
  return out;
}

/** A label as plain text: quotes taken off, line breaks kept as a newline, every other tag dropped. */
const plain = (raw: string) =>
  withoutTags(
    raw
      .trim()
      .replace(/^"(.*)"$/s, '$1')
      .replace(/<br\s*\/?>/gi, '\n'),
  ).trim();

const SHAPE = String.raw`(?:\[\[(.*?)\]\]|\[\((.*?)\)\]|\(\((.*?)\)\)|\(\[(.*?)\]\)|\[(.*?)\]|\((.*?)\)|\{(.*?)\})`;
const NODE = new RegExp(String.raw`^\s*([A-Za-z_]\w*)${SHAPE}?`);
const ARROW = new RegExp(
  String.raw`^\s*(?:<?(?:-->|---+>?|-\.->|-\.-|==+>|===|--[xo])|--\s(.+?)\s-->|==\s(.+?)\s==>|-\.\s(.+?)\s\.->)(?:\s*\|(.*?)\|)?`,
);
const STYLE = /^(style|classDef|class|linkStyle|click|direction|accTitle|accDescr)\b/;
const SUBGRAPH = /^subgraph\s+(?:([A-Za-z_]\w*)\s*(?:\[(.*)\])?|(.+))$/;

/** The text a shape holds, whichever of its seven forms was written. */
const shapeText = (m: RegExpMatchArray, from: number) => m.slice(from, from + 7).find((s) => s !== undefined);

/** A flowchart's lines, after its header. */
function readFlowchart(lines: string[], first: number): MermaidRead {
  const out: MermaidRead = { kind: 'flowchart', things: [], links: [], groups: [], problems: [] };
  const seen = new Map<string, MermaidThing>();
  const open: string[] = [];
  const bad = (line: number, why: MermaidProblemKind) => out.problems.push({ line, why });
  const touch = (id: string, text: string | undefined, line: number) => {
    const known = seen.get(id);
    if (known) {
      if (text !== undefined) known.label = plain(text);
      return;
    }
    const thing = { id, label: text === undefined ? id : plain(text), line, group: open[open.length - 1] ?? null };
    seen.set(id, thing);
    out.things.push(thing);
  };
  for (let i = first; i < lines.length; i++) {
    const line = i + 1;
    let s = (lines[i] ?? '').trim();
    if (!s || s.startsWith('%%')) continue;
    if (STYLE.test(s)) {
      bad(line, 'ignored');
      continue;
    }
    if (s === 'end') {
      open.pop();
      continue;
    }
    const sub = SUBGRAPH.exec(s);
    if (sub) {
      const id = sub[1] ?? (sub[3] ?? '').trim().replace(/\W+/g, '_');
      out.groups.push({ id, label: plain(sub[2] ?? sub[3] ?? id), line, parent: open[open.length - 1] ?? null });
      open.push(id);
      continue;
    }
    let prev: string | null = null;
    let words = '';
    for (;;) {
      const n = NODE.exec(s);
      if (!n) break;
      const id = n[1] ?? '';
      touch(id, shapeText(n, 2), line);
      if (prev) out.links.push({ from: prev, to: id, label: plain(words), line });
      prev = id;
      s = s.slice(n[0].length);
      const a = ARROW.exec(s);
      if (!a) break;
      words = a[1] ?? a[2] ?? a[3] ?? a[4] ?? '';
      s = s.slice(a[0].length);
    }
    if (s.trim()) bad(line, /[&]|:::/.test(s) || s.trim().startsWith('&') ? 'unsupported' : 'unreadable');
  }
  return out;
}

/** A mindmap's lines, after its header: each line a node, its parent the nearest line above with fewer indents. */
function readMindmap(lines: string[], first: number): MermaidRead {
  const out: MermaidRead = { kind: 'mindmap', things: [], links: [], groups: [], problems: [] };
  const stack: { indent: number; id: string }[] = [];
  for (let i = first; i < lines.length; i++) {
    const line = i + 1;
    const raw = lines[i] ?? '';
    const text = raw.trim();
    if (!text || text.startsWith('%%')) continue;
    if (text.startsWith('::')) {
      out.problems.push({ line, why: 'ignored' });
      continue;
    }
    const indent = raw.length - raw.trimStart().length;
    const shaped = NODE.exec(text);
    const label = shaped && shaped[0] === text && shapeText(shaped, 2) !== undefined ? shapeText(shaped, 2) : text;
    const id = `m${line}`;
    while ((stack[stack.length - 1]?.indent ?? -1) >= indent) stack.pop();
    const parent = stack[stack.length - 1];
    out.things.push({ id, label: plain(label ?? text), line, group: null });
    if (parent) out.links.push({ from: parent.id, to: id, label: '', line });
    stack.push({ indent, id });
  }
  return out;
}

/** A Mermaid block read, or refused with its reason. */
export function readMermaid(text: string): MermaidRead | MermaidRefusal {
  if (text.length > MERMAID_LIMITS.bytes) return { why: 'too-large' };
  if (text.includes('\u0000')) return { why: 'not-text' };
  const lines = text.split(/\r?\n/);
  if (lines.length > MERMAID_LIMITS.lines) return { why: 'too-many-lines' };
  const at = lines.findIndex((l) => l.trim() && !l.trim().startsWith('%%'));
  const head = (lines[at] ?? '').trim();
  if (/^(flowchart|graph)(\s+(TD|TB|BT|RL|LR))?$/.test(head)) return readFlowchart(lines, at + 1);
  if (head === 'mindmap') return readMindmap(lines, at + 1);
  return { why: 'unknown-type' };
}
