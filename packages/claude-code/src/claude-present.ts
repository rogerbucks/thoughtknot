// Claude shows, presents and asks, in the Claude Code pane (editor spec §49, workstream Y1). Each tool's input is read
// here, and what the pane draws is made here, on the core:
// - `show` opens a note's graph, or turns it to the things, links, a path or a lens Claude names (claude_shows). It
//   changes nothing in the note.
// - `present` walks steps the person moves through by button or key (claude_presents). A step that names something
//   not in the graph is reported, and nothing is shown (path_no_steps).
// Picking out fades the rest and moves no box (ethos principle 8, never disorient the user). The gate is the mod's own,
// the same as /graph's, and runs before any of this (register.tsx).
import {
  gqlBlocks,
  lensFinds,
  pathsOf,
  pickOut,
  readNote,
  readSteps,
  stepsMissing,
  withPicked,
  word,
} from '@thoughtknot/core';
import type { GraphDrawing, Palette, PresentStep, StepLink } from '@thoughtknot/core';
import { viewOf } from './graph-view.ts';
import type { GraphView } from './graph-view.ts';
import type { Laid } from './graphviz-process.ts';

/** What `show` was asked to turn the graph to: things and links, a path, or a lens. None of them: the whole graph. */
export interface ShowAsk {
  note: string;
  things?: string[];
  links?: StepLink[];
  path?: string;
  lens?: string;
}

/** The `show` tool's input, checked for its shape; or why it is refused. */
export function readShow(input: unknown): { ask: ShowAsk } | { refused: string } {
  const i = (input ?? {}) as Record<string, unknown>;
  if (typeof i.note !== 'string' || !i.note.trim()) return { refused: word('cc.usage') };
  const ask: ShowAsk = { note: i.note.trim() };
  if (i.things !== undefined || i.links !== undefined) {
    const steps = readSteps([{ things: i.things ?? [], links: i.links ?? [], caption: '-' }]);
    if ('refused' in steps) return { refused: steps.refused.replace(/^Step 1 /, 'It ') };
    const [step] = steps.steps as [PresentStep];
    ask.things = step.things;
    ask.links = step.links;
  }
  if (typeof i.path === 'string' && i.path.trim()) ask.path = i.path.trim();
  if (typeof i.lens === 'string' && i.lens.trim()) ask.lens = i.lens.trim();
  return { ask };
}

/** The first graph of a note, as the pane draws it; null when there is none to draw. */
export function firstDrawing(note: string): GraphDrawing | null {
  const [drawing] = readNote(gqlBlocks(note).map((b) => b.text)).graphs.values();
  return drawing ?? null;
}

/**
 * What `show` picks out: the things and links named, the things of a path, or the things a lens finds. Null for the
 * whole graph. Refused, with why, for a path or a lens the graph does not hold.
 */
export function focusOf(
  note: string,
  ask: ShowAsk,
): { step: Pick<PresentStep, 'things' | 'links'> } | null | { refused: string } {
  const drawing = firstDrawing(note);
  if (!drawing) return null;
  if (ask.path) {
    const reading = readNote(gqlBlocks(note).map((b) => b.text));
    const path = pathsOf(reading, drawing.graph).find((p) => p.id === ask.path || p.title === ask.path);
    if (!path || path.empty) return { refused: word('cc.show.no-path', { path: ask.path, graph: drawing.graph }) };
    return { step: { things: path.steps.filter((s) => !s.missing).map((s) => s.key), links: [] } };
  }
  if (ask.lens) {
    const things = lensFinds(note, drawing.graph, ask.lens);
    if (!things.length) return { refused: word('cc.show.no-lens', { lens: ask.lens, graph: drawing.graph }) };
    return { step: { things, links: [] } };
  }
  if (ask.things || ask.links) return { step: { things: ask.things ?? [], links: ask.links ?? [] } };
  return null;
}

/** What the pane shows for one step: the view with it picked out, or why it cannot be (names the graph lacks). */
export async function pickedView(
  note: string,
  step: Pick<PresentStep, 'things' | 'links'> | null,
  caption: string | null,
  lay: (dots: string[]) => Promise<Laid>,
  palette: Palette,
): Promise<{ view: GraphView } | { refused: string }> {
  const drawing = firstDrawing(note);
  if (step && drawing) {
    const { missing } = pickOut(drawing, step);
    if (missing.length)
      return { refused: word('present.missing', { n: 1, name: missing[0] ?? '', graph: drawing.graph }) };
  }
  const view = await viewOf(note, lay, palette);
  const picked = step && drawing ? pickOut(drawing, step).picked : null;
  const said = caption ? [caption] : [];
  const shown: GraphView = {
    ...view,
    alt: [...said, view.alt].join(' '),
    lines: [...said, ...view.lines],
    ...(view.svg && picked ? { svg: withPicked(view.svg, picked) } : {}),
  };
  return { view: shown };
}

/** The `present` tool's steps, checked against the note's graph: each step that names what the graph lacks, reported. */
export function readPresent(note: string, input: unknown): { steps: PresentStep[] } | { refused: string } {
  const i = (input ?? {}) as Record<string, unknown>;
  const read = readSteps(i.steps);
  if ('refused' in read) return read;
  const drawing = firstDrawing(note);
  if (!drawing) return { refused: word('cc.no-graph') };
  const missing = stepsMissing(drawing, read.steps);
  return missing.length ? { refused: word('present.not-shown', { why: missing.join(' ') }) } : read;
}

/** What `show` and `present` need of the host: the gate /graph uses, the note's text, the layout and the palette. */
export interface StagePorts {
  gate: (path: string) => Promise<object>;
  read: (path: string) => Promise<string>;
  lay: (dots: string[]) => Promise<Laid>;
  palette: Palette;
}

/** A note past the gate and read, or what Claude is told instead: the same refusal and question /graph gives. */
export async function gated(
  ports: Pick<StagePorts, 'gate' | 'read'>,
  path: string,
): Promise<{ note: string } | { text: string }> {
  const gate = await ports.gate(path);
  if ('refuse' in gate) return { text: word('cc.refused-not-drawn', { why: String(gate.refuse) }) };
  if ('ask' in gate) return { text: word('cc.asks-not-drawn', { why: String(gate.ask), path }) };
  try {
    return { note: await ports.read(path) };
  } catch (err) {
    return { text: word('cc.could-not-read', { path, why: err instanceof Error ? err.message : String(err) }) };
  }
}

/**
 * `show`: the note past the gate, its graph turned to what Claude named. The view for the pane, and what Claude is
 * told. The note is only read.
 */
export async function showThrough(ports: StagePorts, input: unknown): Promise<{ text: string; view?: GraphView }> {
  const read = readShow(input);
  if ('refused' in read) return { text: read.refused };
  const got = await gated(ports, read.ask.note);
  if ('text' in got) return got;
  const focus = focusOf(got.note, read.ask);
  if (focus && 'refused' in focus) return { text: focus.refused };
  const shown = await pickedView(got.note, focus?.step ?? null, null, ports.lay, ports.palette);
  if ('refused' in shown) return { text: word('present.not-shown', { why: shown.refused }) };
  return { text: word('cc.show.shown', { alt: shown.view.alt }), view: shown.view };
}

/** `present`: the note past the gate and its steps checked; or what Claude is told instead. */
export async function presentThrough(
  ports: StagePorts,
  input: unknown,
): Promise<{ text: string } | { note: string; path: string; steps: PresentStep[] }> {
  const i = (input ?? {}) as Record<string, unknown>;
  if (typeof i.note !== 'string' || !i.note.trim()) return { text: word('cc.usage') };
  const path = i.note.trim();
  const got = await gated(ports, path);
  if ('text' in got) return got;
  const read = readPresent(got.note, input);
  return 'refused' in read ? { text: read.refused } : { note: got.note, path, steps: read.steps };
}
