// What the Copilot Cowork skill's companion script does (editor spec §46, cowork_skill). Every reading, check, layout and
// edit comes from the library (@thoughtknot/core), never from a rule written here (cowork_core_only). This file only
// joins them for Cowork. It adds the gate before a note is read, a proposal before a note is changed, and the drawing
// as files.
// - It makes no network call and holds no secret (cowork_no_server). It reads and writes the files it is handed, and
//   nothing else.
// - Some notes are never read into the conversation (cowork_ceiling). They are a note above the AI ceiling, one at the
//   highest classification, one holding a credential, and one whose classification cannot be read. Microsoft 365 sensitivity labels apply as well,
//   and this never stands in for them.
// - An edit is a proposal. Nothing is written until the person approves that edit of that note as it now is
//   (cowork_same_bytes, answers_are_proposals).
import {
  addedNear,
  addThing,
  chosen,
  claudeGate,
  classificationOf,
  deleted,
  directions,
  formatCount,
  gqlBlocks,
  gqlSpans,
  graphOfBlock,
  LAYOUT_LIMITS,
  linkedTo,
  loadEngine,
  overviewPicture,
  PALETTES,
  propertySet,
  quickLine,
  readNote,
  renamed,
  replaceBlock,
  settingsFrom,
  sha256,
  tooLarge,
  word,
} from '@thoughtknot/core';
import type { BlockEdit, GateSettings, GraphDrawing, NoteReading, Refusal } from '@thoughtknot/core';
import { svgToPng } from './raster.ts';

/** Cowork's limits for a skill, as far as they are known, so the package is checked against them (cowork_skill). */
export const COWORK_LIMITS = {
  /** The most lines in SKILL.md. */
  skillLines: 500,
  /** The most bytes in the whole package. */
  packageBytes: 8 * 1024 * 1024,
  /** The most bytes of any one file in it. */
  fileBytes: 4 * 1024 * 1024,
} as const;

/** What the gate says about a note: it may be read, or it needs a yes first, or it is refused. Never the note's text. */
export type Cleared =
  { open: true; level: string | null } | { open: false; ask: string; digest: string } | { open: false; refuse: string };

/**
 * Whether a note may be read into the conversation. `saved` is the settings the person keeps for the library: their
 * classifications and the models' ceilings. Else the library's own settings hold back every unclassified note.
 * `confirmed` is the digest the person said yes to.
 */
export function clear(note: string, saved: unknown = {}, confirmed: string | null = null): Cleared {
  const settings = settingsFrom(saved) as GateSettings;
  const gate = claudeGate(note, settings, confirmed);
  if ('refuse' in gate) return { open: false, refuse: word('cowork.refused', { why: gate.refuse }) };
  if ('ask' in gate) return { open: false, ask: word('cowork.ask', { why: gate.ask }), digest: sha256(note) };
  const given = classificationOf(note);
  return { open: true, level: given.kind === 'given' ? given.level : null };
}

/** A problem as the person reads it, with the line of the note it is on. */
export interface Found {
  graph: string | null;
  line: number;
  severity: 'error' | 'warning' | 'hint';
  message: string;
  fix: string;
}

/** The note's problems, each on its line of the note. */
export function problemsOf(note: string, reading: NoteReading): Found[] {
  const blocks = gqlBlocks(note);
  return reading.problems
    .filter((p) => p.severity !== 'hint')
    .map((p) => ({
      graph: p.graph,
      line: (blocks[p.block]?.line ?? 0) + p.line,
      severity: p.severity,
      message: p.message,
      fix: p.fix,
    }));
}

/** Why a graph is over the limits, in words (the words the other hosts use). */
function refusalWords(r: Refusal): string {
  if (r.reason !== 'too-large') return word('cc.not-drawn', { instead: word('cc.instead') });
  if (r.limit === 'text-bytes' || r.limit === 'text-lines')
    return word('cc.too-large-to-read', {
      size: formatCount(r.count),
      unit: word(r.limit === 'text-bytes' ? 'cc.unit.bytes' : 'cc.unit.lines'),
      most: formatCount(r.most),
    });
  const what = r.limit === 'source' ? word('cc.unit.source') : r.limit === 'word' ? word('cc.unit.word') : r.limit;
  const size = r.atLeast ? word('cc.at-least', { size: formatCount(r.count) }) : formatCount(r.count);
  return word('cc.too-large-to-draw', { size, what, most: formatCount(r.most), instead: word('cc.instead') });
}

/** One graph as the conversation reads it. */
export interface GraphRead {
  name: string;
  things: { key: string; kind: string; text: string }[];
  links: { from: string; reading: string; to: string }[];
}

/** What reading a note gives: its graphs and its problems. */
export interface Read {
  graphs: GraphRead[];
  problems: Found[];
  /** Why nothing was read, when the note is too large or has no graph. */
  why?: string;
}

const graphRead = (d: GraphDrawing): GraphRead => ({
  name: d.graph,
  things: d.boxes.map((b) => ({ key: b.key, kind: b.kind, text: b.text })),
  links: d.links.map((l) => ({ from: l.from, reading: l.reading, to: l.to })),
});

/** The readings and problems of a note (the same the other hosts give), for a note already cleared. */
export function read(note: string): Read {
  const reading = readNote(gqlBlocks(note).map((b) => b.text));
  const problems = problemsOf(note, reading);
  if (reading.tooLarge) return { graphs: [], problems, why: refusalWords(reading.tooLarge) };
  const graphs = [...reading.graphs.values()].map(graphRead);
  return graphs.length ? { graphs, problems } : { graphs, problems, why: word('cowork.no-graph') };
}

/** The graph as lines of text, which stand in wherever it cannot be drawn. */
export function asText(d: GraphDrawing): string[] {
  const things = word('cowork.card.things', { count: d.boxes.length }),
    links = word('cowork.card.links', { count: d.links.length });
  return [`${d.graph}: ${things}, ${links}`, ...d.links.map((l) => `${l.from} —${l.reading}→ ${l.to}`)];
}

/** What drawing a note gives: files to write beside it, and a card for the conversation. Never a blank result. */
export interface Drawn {
  card: string;
  /** The graph as lines of text, always. */
  text: string[];
  svg?: string;
  png?: Uint8Array;
  /** Why there is no drawing (or no PNG), when there is not. */
  why?: string;
  /** What else the person is told. */
  notes: string[];
}

/** The first graph of a note, or the one named, drawn as an SVG and a PNG. It comes with a card and the graph as text. */
export async function draw(note: string, level: string | null, graph?: string): Promise<Drawn> {
  const reading = readNote(gqlBlocks(note).map((b) => b.text));
  const problems = problemsOf(note, reading).length;
  const wanted = graph ? reading.graphs.get(graph) : [...reading.graphs.values()][0];
  if (reading.tooLarge || !wanted) {
    const why = reading.tooLarge ? refusalWords(reading.tooLarge) : word('cowork.no-graph');
    return { card: word('cowork.not-drawn', { why }), text: [why], why, notes: [] };
  }
  const things = word('cowork.card.things', { count: wanted.boxes.length });
  const links = word('cowork.card.links', { count: wanted.links.length });
  const card = [
    word('cowork.card', {
      graph: wanted.graph,
      things,
      links,
      problems: word('cowork.card.problems', { count: problems }),
    }),
    level === null ? word('cowork.card.unlabelled') : word('cowork.card.class', { level }),
  ].join(' ');
  const text = asText(wanted);
  const palette = PALETTES.light;

  const refused = tooLarge(wanted, LAYOUT_LIMITS);
  let svg: string;
  if (refused) {
    const said = refusalWords(refused);
    svg = overviewPicture(wanted, palette, (groups) => [
      word('cc.overview', {
        graph: wanted.graph,
        things: word('cc.things', { count: wanted.boxes.length }),
        groups: word('cc.groups', { count: groups }),
      }),
      said.replace(` ${word('cc.instead')}`, ''),
      word('cc.as-overview'),
    ]).svg;
  } else {
    try {
      const engine = await loadEngine();
      const laid = directions(wanted);
      svg = chosen(
        laid,
        laid.map((d) => engine.render(d.dot)),
        palette,
      ).svg;
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      return { card: word('cowork.not-drawn', { why }), text, why, notes: [] };
    }
  }
  const notes: string[] = [];
  const raster = svgToPng(svg);
  if ('why' in raster) return { card, text, svg, why: raster.why, notes };
  if (raster.unknown) notes.push(word('cowork.png-text', { count: raster.unknown }));
  return { card, text, svg, png: raster.png, notes };
}

/** An edit asked for, in the words of the library's own edits. `graph` is the first graph unless named. */
export type EditAsk =
  | { do: 'rename'; thing: string; text: string; graph?: string }
  | { do: 'add-child' | 'add-sibling'; thing: string; text: string; graph?: string }
  | { do: 'new'; text: string; kind?: string; name?: string; graph?: string }
  | { do: 'delete'; thing: string; graph?: string }
  | { do: 'link'; from: string; to: string; type?: string; graph?: string }
  | { do: 'set'; thing: string; prop: string; value: string; graph?: string }
  | { do: 'line'; line: string; from?: string; graph?: string };

/** The edits the skill knows, and what each needs. */
export const EDITS: Record<EditAsk['do'], string[]> = {
  rename: ['thing', 'text'],
  'add-child': ['thing', 'text'],
  'add-sibling': ['thing', 'text'],
  new: ['text'],
  delete: ['thing'],
  link: ['from', 'to'],
  set: ['thing', 'prop', 'value'],
  line: ['line'],
};

/** A proposal: what would change, in words, the note as it would be, and the digest that approves exactly this. */
export type Proposal =
  | { refused: string }
  | { same: true; said: string }
  | { said: string; was: string; now: string; after: string; approve: string };

/**
 * The digest that approves one edit of one note: the note as it is and as it would be. It is an integrity check, not
 * proof of a person's yes: it stops a stale or different edit being written. That the person said yes is SKILL.md's
 * rule for the model, which the script cannot see.
 */
export const approvalFor = (before: string, after: string): string => sha256(`${before}\u0000${after}`);

/** The proposal for an edit of a note (nothing is written). */
export function propose(note: string, ask: EditAsk): Proposal {
  const asked = ask as Record<string, string | undefined>;
  const known = Object.keys(EDITS);
  if (!known.includes(ask.do))
    return { refused: word('cowork.edit.unknown', { edit: String(ask.do), known: known.join(', ') }) };
  const missing = EDITS[ask.do].filter((f) => typeof asked[f] !== 'string' || !asked[f]);
  if (missing.length) return { refused: word('cowork.edit.missing', { edit: ask.do, needs: missing.join(', ') }) };
  const reading = readNote(gqlBlocks(note).map((b) => b.text));
  const graph = ask.graph ?? [...reading.graphs.keys()][0];
  if (!graph) return { refused: word('cowork.no-graph') };
  const texts = [...reading.texts];
  let made:
    BlockEdit | { block: number; was: string; now: string; name?: string; things?: string[] } | { reason: string };
  switch (ask.do) {
    case 'rename':
      made = renamed(texts, graph, ask.thing, ask.text);
      break;
    case 'add-child':
    case 'add-sibling':
      made = addedNear(reading, graph, ask.thing, ask.do === 'add-child' ? 'child' : 'sibling', ask.text);
      break;
    case 'new': {
      const at = texts.findIndex((t) => graphOfBlock(t) === graph);
      const block = at < 0 ? 0 : at;
      const was = texts[block] ?? '';
      const added = addThing(reading, graph, was, { text: ask.text, kind: ask.kind, name: ask.name });
      made = 'refused' in added ? { reason: added.refused } : { block, was, now: added.text, name: added.name };
      break;
    }
    case 'delete':
      made = deleted(texts, graph, ask.thing);
      break;
    case 'link':
      made = linkedTo(reading, graph, ask.from, ask.to, ask.type);
      break;
    case 'set':
      made = propertySet(reading, graph, ask.thing, ask.prop, ask.value);
      break;
    case 'line':
      made = quickLine(reading, graph, ask.line, ask.from);
      break;
  }
  if ('reason' in made) return { refused: word('cowork.proposal.refused', { why: made.reason }) };
  const span = gqlSpans(note)[made.block];
  if (!span) return { refused: word('cowork.proposal.refused', { why: word('cowork.no-graph') }) };
  const written = replaceBlock(note, { line: span.open, text: span.text }, made.now);
  if (!written.ok) return { refused: word('cowork.proposal.refused', { why: written.reason }) };
  if (written.note === note) return { same: true, said: word('cowork.proposal.no-change') };
  const where = word('cowork.edit.block', { block: made.block + 1, line: span.open + 1 });
  return {
    said: word('cowork.proposal', { what: `${ask.do} in ${where}` }),
    was: made.was,
    now: made.now,
    after: written.note,
    approve: approvalFor(note, written.note),
  };
}

/** What applying an approved edit gives: the note to write, or why nothing is written. */
export type Applied = { write: string; said: string } | { refused: string };

/** The note to write for an edit, only when `approved` is the digest of this very edit of this very note. */
export function apply(note: string, ask: EditAsk, approved: string): Applied {
  const made = propose(note, ask);
  if ('refused' in made) return { refused: made.refused };
  if ('same' in made) return { refused: made.said };
  if (made.approve !== approved) return { refused: word('cowork.apply.not-approved') };
  return { write: made.after, said: word('cowork.apply.written') };
}
