// A parcel: what crosses from the personal layer to a corporate one (editor spec §40, boundary_contract). It is plain
// text only, so both sides read it with nothing of ours installed.
// - The note, its graph blocks written back with the setting's rules applied. Its picture of each graph, as SVG, for a
//   reader without the plug-in. A manifest saying what was left out, what is AI-made and a hash of the rest.
// - It is made from a note's text alone. It never takes a store, a key or a review queue. So an AI suggestion nobody
//   applied, which lives only in the review queue, cannot cross.
// - Personal things never cross: profiles and what was learned (corporateView in the core, §39).
// - Any key in what would cross refuses the whole parcel (keys-found.ts). Nothing is quietly cut out.
// - AI-made content follows the setting's rule: labelled, left out and listed, or held until a person allows it.
import {
  applyBoundary,
  corporateView,
  draw,
  gqlBlock,
  gqlSpans,
  graphOfBlock,
  readNote,
  sha256,
} from '@thoughtknot/core';
import type { Engine } from '@thoughtknot/core';
import type { Graph, Value } from '@thoughtknot/graph-spec';
import { keysIn } from './keys-found.ts';
import type { AiRule, Setting } from './setting.ts';

/** The format a parcel's manifest names, so a reader knows what it holds. */
export const PARCEL_FORMAT = 'thoughtknot-parcel@1';

/** One file of a parcel: where it goes, its type and its text. */
export interface ParcelFile {
  path: string;
  type: 'text/markdown' | 'image/svg+xml' | 'application/json';
  text: string;
}

/** Why a thing is not in a parcel as written: redacted by the setting, AI-made and removed, or a block not read. */
export interface Left {
  kind: 'redacted' | 'ai-removed' | 'unread';
  graph: string;
  thing?: string;
  key?: string;
}

/** What a parcel says of itself. Readable by both sides: it holds no content, only what was done to it. */
export interface Manifest {
  format: typeof PARCEL_FORMAT;
  setting: string;
  note: string;
  date: string;
  graphs: string[];
  ai: AiRule;
  aiLabel: string;
  /** Things and links labelled AI-made, as `graph/id` or `graph/from-TYPE->to`. */
  aiLabelled: string[];
  left: Left[];
  /** How many personal things (profiles, what was learned) stayed behind. */
  personal: number;
  /** The SHA-256 of every other file, in order, so a reader can tell a parcel was changed after it crossed. */
  hash: string;
}

/** A parcel that may cross. Frozen: what was checked is what crosses. */
export interface Parcel {
  readonly kind: 'parcel';
  readonly files: readonly ParcelFile[];
  readonly manifest: Manifest;
}

/** The answer to making a parcel: one that may cross, or why not. */
export type Crossing =
  | { ok: true; parcel: Parcel }
  | { ok: false; why: 'key'; kinds: string[]; files: string[] }
  | { ok: false; why: 'hold'; aiThings: string[] };

/** The note to send: its path in the vault and its text. */
export interface NoteToSend {
  path: string;
  text: string;
}

/** How to make it: the day it is said to cross, the engine to draw its pictures, and whether a held crossing is allowed. */
export interface ParcelOptions {
  date?: string;
  engine?: Engine;
  /** A person allowed this crossing, with its AI-made things, under a setting that holds them. */
  allowed?: boolean;
}

/** Whether a thing or link was made with an AI's help, as the core's export rules judge it. */
const aiMade = (p: Record<string, Value>) => p['ai_assisted'] === true || p['proposer_kind'] === 'model';
const linkName = (graph: string, [a, t, b]: Graph['edges'][number]) => `${graph}/${a}-${t}->${b}`;

/** The note's graphs, without their personal things, and how many those were. */
function worldOf(spans: { text: string }[]): { world: Record<string, Graph>; personal: number } {
  const whole = readNote(spans.map((s) => s.text)).whole;
  const world = corporateView(whole);
  let personal = 0;
  for (const [name, g] of Object.entries(whole)) personal += g.nodes.size - (world[name]?.nodes.size ?? 0);
  return { world, personal };
}

/** The AI-made things and links of a graph, by name. */
function aiOf(graph: string, g: Pick<Graph, 'nodes' | 'edges'>): string[] {
  return [
    ...[...g.nodes].filter(([, [, p]]) => aiMade(p)).map(([id]) => `${graph}/${id}`),
    ...g.edges.filter((e) => aiMade(e[3])).map((e) => linkName(graph, e)),
  ];
}

/** `g` with the setting's rules applied: AI-made content removed or labelled, then the redactions. */
function bounded(graph: string, g: Graph, setting: Setting, left: Left[], labelled: string[]) {
  let nodes = g.nodes,
    edges = g.edges;
  if (setting.ai === 'remove') {
    for (const [id, [, p]] of nodes) if (aiMade(p)) left.push({ kind: 'ai-removed', graph, thing: id });
    nodes = new Map([...nodes].filter(([, [, p]]) => !aiMade(p)));
    edges = edges.filter((e) => nodes.has(e[0]) && nodes.has(e[2]));
    for (const e of edges) if (aiMade(e[3])) left.push({ kind: 'ai-removed', graph, thing: linkName(graph, e) });
    edges = edges.filter((e) => !aiMade(e[3]));
  }
  const out = applyBoundary({ nodes, edges }, setting);
  for (const gap of out.gaps) left.push({ graph, ...gap });
  labelled.push(...out.aiAssisted.map((id) => `${graph}/${id}`));
  // the core's rules label things; a link an AI made is labelled the same way
  const links = out.graph.edges.map((e): Graph['edges'][number] => {
    if (!aiMade(e[3])) return e;
    labelled.push(linkName(graph, e));
    return [e[0], e[1], e[2], { ...e[3], ai_label: setting.aiLabel }];
  });
  return { nodes: out.graph.nodes, edges: links };
}

/** The parcel of one note under one setting, or why it may not cross. */
export function makeParcel(note: NoteToSend, setting: Setting, options: ParcelOptions = {}): Crossing {
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  const spans = gqlSpans(note.text);
  const { world, personal } = worldOf(spans);
  if (setting.ai === 'hold' && !options.allowed) {
    const aiThings = Object.entries(world).flatMap(([name, g]) => aiOf(name, g));
    if (aiThings.length) return { ok: false, why: 'hold', aiThings };
  }
  const left: Left[] = [],
    labelled: string[] = [],
    graphs: string[] = [],
    blocks = new Map<number, string>();
  spans.forEach((span, i) => {
    const name = graphOfBlock(span.text);
    if (name === null) return;
    const g = world[name];
    // a graph written over several blocks is written whole in its first; one that could not be read is left out
    if (!g || graphs.includes(name)) {
      if (!g) left.push({ kind: 'unread', graph: name });
      blocks.set(i, '');
      return;
    }
    graphs.push(name);
    const b = bounded(name, g, setting, left, labelled);
    const things = [...b.nodes].map(
      ([id, [labels, props]]) => [id, [...labels], props] as [string, string[], typeof props],
    );
    blocks.set(i, gqlBlock({ graph: name, things, links: b.edges }, { note: note.path, date }).replace(/\n$/, ''));
  });
  const lines = note.text.split('\n');
  for (const [i, span] of [...spans.entries()].reverse()) {
    const text = blocks.get(i);
    if (text !== undefined) lines.splice(span.open + 1, span.close - span.open - 1, ...(text ? text.split('\n') : []));
  }
  const files: ParcelFile[] = [{ path: note.path, type: 'text/markdown', text: lines.join('\n') }];
  if (options.engine) {
    const reading = readNote([...blocks.values()].filter(Boolean));
    for (const name of graphs) {
      const drawing = reading.graphs.get(name);
      if (drawing) files.push({ path: `${name}.svg`, type: 'image/svg+xml', text: draw(drawing, options.engine).svg });
    }
  }
  const manifest: Manifest = {
    format: PARCEL_FORMAT,
    setting: setting.name,
    note: note.path,
    date,
    graphs,
    ai: setting.ai,
    aiLabel: setting.aiLabel,
    aiLabelled: labelled,
    left,
    personal,
    hash: sha256(files.map((f) => `${f.path}\n${f.text}`).join('\n')),
  };
  const all = [
    ...files,
    { path: 'manifest.json', type: 'application/json' as const, text: JSON.stringify(manifest, null, 2) },
  ];
  const keyed = all.map((f) => ({ path: f.path, kinds: keysIn(f.text) })).filter((f) => f.kinds.length);
  if (keyed.length)
    return {
      ok: false,
      why: 'key',
      kinds: [...new Set(keyed.flatMap((f) => f.kinds))],
      files: keyed.map((f) => f.path),
    };
  return {
    ok: true,
    parcel: Object.freeze({
      kind: 'parcel',
      files: Object.freeze(all.map((f) => Object.freeze(f))),
      manifest: Object.freeze(manifest),
    }),
  };
}

/** Whether `x` is a parcel made here, whole: the one thing the web layer and a corporate host accept. */
export function isParcel(x: unknown): x is Parcel {
  if (!x || typeof x !== 'object' || !Object.isFrozen(x)) return false;
  const p = x as Partial<Parcel>;
  return p.kind === 'parcel' && Array.isArray(p.files) && p.manifest?.format === PARCEL_FORMAT;
}
