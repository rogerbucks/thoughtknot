// The XML parts of a PowerPoint file, as small trees, in plain JavaScript (ES§45 board_exchange, ES§67
// format_untrusted_files). It sits on xml-scan.ts, so a document type line is refused and no entity grows.
// - Untrusted: a tree is cut at a depth and at a count of nodes. So a file cannot make the page hold more than it says.
// - A relationship file says where each id points. A target outside the zip, or on the web, is never followed.
import { tokens } from './xml-scan.ts';
import { Damaged, TooBig } from './zip-read.ts';

/** One element of an XML part: its name without prefix, its attributes, its children and the text directly in it. */
export interface XNode {
  name: string;
  attrs: Record<string, string>;
  kids: XNode[];
  text: string;
  /** The tag as written, kept only for `sldId`, whose two ids differ by their prefix alone. */
  raw?: string;
}

/** How deep a part may nest, and how many nodes the parts of one file may hold in all. */
export const XML_LIMITS = { depth: 64, nodes: 600_000 };

/** The count of nodes spent so far over every part of one file. */
export interface Spent {
  nodes: number;
}

/** The tree of an XML part. A part nested deeper than the limit is damaged; one with too many nodes is too big. */
export function xmlTree(xml: string, spent: Spent, limits = XML_LIMITS): XNode {
  const root: XNode = { name: '', attrs: {}, kids: [], text: '' };
  const stack: XNode[] = [root];
  for (const t of tokens(xml)) {
    const top = stack[stack.length - 1] as XNode;
    if ('text' in t) top.text += t.text;
    else if ('open' in t) {
      if (++spent.nodes > limits.nodes) throw new TooBig();
      const node: XNode = { name: t.open, attrs: t.attrs, kids: [], text: '' };
      if (t.open === 'sldId' && t.at !== undefined) node.raw = xml.slice(t.at, xml.indexOf('>', t.at) + 1);
      top.kids.push(node);
      stack.push(node);
      if (stack.length > limits.depth) throw new Damaged();
    } else {
      if (stack.length < 2 || top.name !== t.close) throw new Damaged();
      stack.pop();
    }
  }
  if (stack.length !== 1) throw new Damaged();
  return root;
}

/** The first child named `name`, or undefined. */
export const kid = (n: XNode | undefined, name: string): XNode | undefined => n?.kids.find((k) => k.name === name);

/** Every child named `name`. */
export const kidsOf = (n: XNode | undefined, name: string): XNode[] => n?.kids.filter((k) => k.name === name) ?? [];

/** The first node named `name` at any depth below `n`, searching in order; or undefined. */
export function deep(n: XNode | undefined, name: string): XNode | undefined {
  for (const k of n?.kids ?? []) {
    if (k.name === name) return k;
    const found = deep(k, name);
    if (found) return found;
  }
  return undefined;
}

/** A relationship file's targets by id, each resolved against the folder of the part it belongs to. */
export interface Rels {
  byId: Map<string, { type: string; part: string }>;
}

/** The part a target names, from the folder `base` of the part that holds it; null when it leaves the zip. */
export function resolvePart(base: string, target: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) return null;
  const path = target.startsWith('/') ? target.slice(1) : `${base}${target}`;
  const out: string[] = [];
  for (const piece of path.split('/')) {
    if (piece === '' || piece === '.') continue;
    if (piece === '..') {
      if (!out.length) return null;
      out.pop();
    } else out.push(piece);
  }
  return out.join('/');
}

/** The relationships of the part at `part`, read from `rels`; a link to the web is left out. */
export function relsOf(rels: XNode | undefined, part: string): Rels {
  const base = part.includes('/') ? part.slice(0, part.lastIndexOf('/') + 1) : '';
  const byId = new Map<string, { type: string; part: string }>();
  for (const r of rels?.kids ?? []) {
    if (r.name !== 'Relationship' || r.attrs.TargetMode?.toLowerCase() === 'external') continue;
    const [id, type, target] = [r.attrs.Id, r.attrs.Type, r.attrs.Target];
    const at = target === undefined ? null : resolvePart(base, target);
    if (id && type && at && !byId.has(id)) byId.set(id, { type: type.slice(type.lastIndexOf('/') + 1), part: at });
  }
  return { byId };
}

/** The name of the relationship file of the part at `part`. */
export function relsName(part: string): string {
  const at = part.lastIndexOf('/');
  return `${part.slice(0, at + 1)}_rels/${part.slice(at + 1)}.rels`;
}
