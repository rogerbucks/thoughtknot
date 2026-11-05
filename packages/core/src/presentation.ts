// Claude presenting a graph (editor spec §49: claude_presents, presentation_kept; §7 path_no_steps). A presentation is
// steps in order. Each step names the things and links to pick out and has a short caption. The person steps through
// it at their own pace.
// - A step that names something not in the graph is reported, never drawn as an empty step.
// - Picking out dims everything else and keeps every box where it is: nothing moves (ethos principle 8).
// - A presentation can be kept in the note as a graph block of its steps, written only once the person accepts it. It
//   then plays again from the note with no AI.
import gs from '@thoughtknot/graph-spec';
import { gqlBlocks, gqlSpans, graphOf } from './blocks.ts';
import { readNote } from './drawing.ts';
import { inImage, withStyleSheet } from './export-motion.ts';
import type { GraphDrawing } from './note-reading.ts';
import { valueGql } from './proposals.ts';
import { insertBlockAfter, replaceBlock } from './store.ts';
import { word } from './words.ts';

/** A link a step picks out: its two ends and its type, as the graph writes them. */
export interface StepLink {
  from: string;
  type: string;
  to: string;
}

/** One step of a presentation: what it picks out, and what it says. */
export interface PresentStep {
  things: string[];
  links: StepLink[];
  caption: string;
}

/** The most steps a presentation takes. */
export const STEPS_MOST = 50;
/** The most characters a step's caption takes. */
export const CAPTION_MOST = 200;

const ONE_WORD = /^\w+$/;
const isWords = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');

/** The steps a tool was given, checked for their shape alone; or why they are refused. */
export function readSteps(given: unknown): { steps: PresentStep[] } | { refused: string } {
  if (!Array.isArray(given) || !given.length) return { refused: word('present.no-steps') };
  if (given.length > STEPS_MOST)
    return { refused: word('present.too-many-steps', { most: STEPS_MOST, count: given.length }) };
  const steps: PresentStep[] = [];
  for (const [i, s] of given.entries()) {
    const n = i + 1;
    const step = (s ?? {}) as Record<string, unknown>;
    const things = step.things ?? [];
    const links = step.links ?? [];
    const caption = step.caption;
    if (typeof caption !== 'string' || !caption.trim() || caption.length > CAPTION_MOST || !isWords(things))
      return { refused: word('present.step-shape', { n, most: CAPTION_MOST }) };
    if (!Array.isArray(links)) return { refused: word('present.step-shape', { n, most: CAPTION_MOST }) };
    const read: StepLink[] = [];
    for (const l of links) {
      const { from, type, to } = (l ?? {}) as Record<string, unknown>;
      if (![from, type, to].every((v) => typeof v === 'string' && ONE_WORD.test(v)))
        return { refused: word('present.link-shape', { n }) };
      read.push({ from: from as string, type: type as string, to: to as string });
    }
    if (!things.length && !read.length) return { refused: word('present.step-empty', { n }) };
    steps.push({ things: [...things], links: read, caption: caption.trim() });
  }
  return { steps };
}

/**
 * The things a lens finds in a note's graph. That is a lens the graph saves, by its id or name. Else the words are taken
 * as a query, such as `Option WHERE price < 3`. None when the graph is not in the note or the lens finds nothing.
 */
export function lensFinds(note: string, graph: string, lens: string): string[] {
  const g = readNote(gqlBlocks(note).map((b) => b.text)).world[graph];
  if (!g) return [];
  const saved = gs.lensesOf(g).find((l) => l.id === lens || l.name === lens);
  return saved ? gs.runLens(g, saved.id).things : gs.queryThings(g, lens);
}

/** A link as a step names it, in words: `a TYPE b`. */
export const linkSaid = (l: StepLink): string => `${l.from} ${l.type} ${l.to}`;

/** What one step picks out of a drawing: the 1-based numbers of its boxes and links, as Graphviz numbers its groups. */
export interface Picked {
  nodes: number[];
  edges: number[];
}

/** The boxes and links of `drawing` a step picks out, and every name it gives that the drawing does not hold. */
export function pickOut(drawing: GraphDrawing, step: Pick<PresentStep, 'things' | 'links'>) {
  const box = new Map(drawing.boxes.map((b, i) => [b.key, i + 1]));
  const nodes: number[] = [],
    edges: number[] = [],
    missing: string[] = [];
  for (const t of step.things) {
    const n = box.get(t);
    if (n === undefined) missing.push(t);
    else nodes.push(n);
  }
  for (const l of step.links) {
    const i = drawing.links.findIndex((d) => d.from === l.from && d.to === l.to && d.type === l.type);
    if (i < 0) missing.push(linkSaid(l));
    else edges.push(i + 1);
  }
  return { picked: { nodes, edges }, missing };
}

/**
 * Every step that names something the graph does not hold: which step, and the first name missing. A step like that
 * is reported, never drawn as an empty step (path_no_steps). Empty when every step can be drawn.
 */
export function stepsMissing(drawing: GraphDrawing, steps: readonly PresentStep[]): string[] {
  return steps.flatMap((s, i) => {
    const { missing } = pickOut(drawing, s);
    return missing.length ? [word('present.missing', { n: i + 1, name: missing[0] ?? '', graph: drawing.graph })] : [];
  });
}

/**
 * The style sheet that picks out a step: every other box and link faded, the picked ones heavier. Only opacity and
 * stroke width change, so every box stays where it is (never disorient the user).
 */
export function pickedCss(p: Picked): string {
  const own = [...p.nodes.map((n) => `#node${n}`), ...p.edges.map((n) => `#edge${n}`)].map(inImage);
  return [
    `${inImage('.node')}, ${inImage('.edge')} { opacity: 0.25; transition: opacity 0.3s; }`,
    own.length ? `${own.join(', ')} { opacity: 1; }` : '',
    own.length
      ? `${own.map((s) => `${s} > path, ${s} > polygon, ${s} > ellipse`).join(', ')} { stroke-width: 3; }`
      : '',
    '@media (prefers-reduced-motion: reduce) { .thoughtknot-image .node, .thoughtknot-image .edge { transition: none; } }',
  ]
    .filter(Boolean)
    .join('\n');
}

/** A drawn graph's SVG with one step picked out. */
export const withPicked = (svg: string, p: Picked): string => withStyleSheet(svg, pickedCss(p));

/** Where a person is in a presentation, and how a button or a key moves them. Nothing moves on its own. */
export class Walk {
  #at = 0;
  readonly steps: readonly PresentStep[];
  constructor(steps: readonly PresentStep[]) {
    this.steps = steps;
  }
  /** The 0-based step shown. */
  get at(): number {
    return this.#at;
  }
  get step(): PresentStep {
    return this.steps[this.#at] as PresentStep;
  }
  get first(): boolean {
    return this.#at === 0;
  }
  get last(): boolean {
    return this.#at === this.steps.length - 1;
  }
  /** Moves one step on; false at the last. */
  next(): boolean {
    if (this.last) return false;
    this.#at++;
    return true;
  }
  /** Moves one step back; false at the first. */
  back(): boolean {
    if (this.first) return false;
    this.#at--;
    return true;
  }
  /** A key, as a keyboard names it: the arrows, Page Up and Down, space, Home and End. Whether it moved. */
  key(name: string): boolean {
    if (name === 'ArrowRight' || name === 'ArrowDown' || name === 'PageDown' || name === ' ') return this.next();
    if (name === 'ArrowLeft' || name === 'ArrowUp' || name === 'PageUp') return this.back();
    const to = name === 'Home' ? 0 : name === 'End' ? this.steps.length - 1 : -1;
    if (to < 0 || to === this.#at) return false;
    this.#at = to;
    return true;
  }
  /** What the step shown says: where it is, and its caption. */
  said(): string {
    return word('present.at', { at: this.#at + 1, all: this.steps.length, caption: this.step.caption });
  }
}

// ---- kept in the note (presentation_kept) ----

/** A presentation as the note keeps it: its name, the graph it presents, and its steps. */
export interface KeptPresentation {
  name: string;
  graph: string;
  steps: PresentStep[];
}

const SUFFIX = '_presentation';
/** The graph a presentation is kept as: its name and `_presentation`. */
export const presentationGraph = (name: string): string => `${name}${SUFFIX}`;

/** The block a presentation is kept as: a Slide for each step, in order, each linked to the next. */
export function presentationBlock(p: KeptPresentation): string {
  const slide = (i: number) => `${p.name}_slide_${i + 1}`;
  const lines = [
    `(${p.name}:Presentation {of: ${valueGql(p.graph)}})`,
    ...p.steps.map(
      (s, i) =>
        `(${slide(i)}:Slide {order: ${i + 1}, caption: ${valueGql(s.caption)}, things: ${valueGql(s.things.join(' '))}, ` +
        `links: ${valueGql(s.links.map(linkSaid).join('; '))}})`,
    ),
    `(${p.name})-[:STARTS_WITH]->(${slide(0)})`,
    ...p.steps.slice(1).map((_, i) => `(${slide(i)})-[:NEXT]->(${slide(i + 1)})`),
  ];
  return `// graph: ${presentationGraph(p.name)}\n${lines.join(',\n')}`;
}

/**
 * The note with a presentation kept, once the person has answered. Only `accepted` writes. It writes a block of its
 * steps after the graph it presents, or in place of the block that kept one of that name. Anything else leaves the note as it
 * is (answers_are_proposals).
 */
export function keepPresentation(
  note: string,
  p: KeptPresentation,
  answer: 'accepted' | 'rejected',
): { ok: true; note: string; written: boolean } | { ok: false; reason: string } {
  if (!ONE_WORD.test(p.name)) return { ok: false, reason: word('present.name') };
  if (answer !== 'accepted') return { ok: true, note, written: false };
  const spans = gqlSpans(note);
  const text = presentationBlock(p);
  const held = spans.find((s) => graphOf(s.text) === presentationGraph(p.name));
  const anchor = spans.filter((s) => graphOf(s.text) === p.graph).at(-1) ?? spans.at(-1);
  if (!held && !anchor) {
    const eol = note.endsWith('\n') || !note ? '' : '\n';
    return { ok: true, note: `${note}${eol}\n\`\`\`gql\n${text}\n\`\`\`\n`, written: true };
  }
  const w = held
    ? replaceBlock(note, { line: held.open, text: held.text }, text)
    : insertBlockAfter(
        note,
        { line: (anchor as (typeof spans)[number]).open, text: (anchor as (typeof spans)[number]).text },
        text,
      );
  return w.ok ? { ok: true, note: w.note, written: true } : { ok: false, reason: w.reason };
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

const linksOf = (said: string): StepLink[] =>
  said
    .split(';')
    .map((l) => l.trim().split(/\s+/))
    .filter((w) => w.length === 3)
    .map(([from, type, to]) => ({ from: from as string, type: type as string, to: to as string }));

/** Every presentation the note keeps, read back from its blocks, to play again with no AI. */
export function presentationsIn(note: string): KeptPresentation[] {
  const blocks = gqlSpans(note)
    .map((s) => s.text)
    .filter((t) => graphOf(t)?.endsWith(SUFFIX));
  const world = readNote(blocks).world;
  const out: KeptPresentation[] = [];
  for (const [graph, g] of Object.entries(world)) {
    if (!graph.endsWith(SUFFIX)) continue;
    const name = graph.slice(0, -SUFFIX.length);
    const of = g.p(name)?.of;
    if (typeof of !== 'string') continue;
    const steps = g
      .labelled('Slide')
      .map((id) => g.p(id))
      .sort((a, b) => Number(a.order) - Number(b.order))
      .map((p) => ({
        caption: text(p.caption),
        things: text(p.things).split(/\s+/).filter(Boolean),
        links: linksOf(text(p.links)),
      }));
    if (steps.length) out.push({ name, graph: of, steps });
  }
  return out;
}
