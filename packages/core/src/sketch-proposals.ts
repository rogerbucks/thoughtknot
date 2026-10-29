// Drawings offered as things and links (editor spec §70, sketch_to_graph; Roger, 27 Oct 2026, #1450). A drawing is
// never data by itself. Asked, the editor reads the drawings over a graph and offers what they seem to say as a
// proposal (§17). A person accepts or rejects it change by change, as any proposal:
// - A note with no pin, or a box or ellipse with words and no pin, is a new thing named by its words.
// - A line, an arrow or a stroke from one thing to another is a link between them, run from where it began. Its words
//   name the link's type; without words it takes the type the graph uses most.
// What the graph holds already is not offered again. Host-free and pure: the host writes the proposal beside the graph.
import gs from '@thoughtknot/graph-spec';
import { gqlBlocks } from './blocks.ts';
import { readNote } from './drawing.ts';
import type { DrawMark } from './drawing-marks.ts';
import type { MarkPoint } from './plugin-diagrams.ts';
import { linkChange, makeProposal, thingChange } from './proposals.ts';
import type { ChangeInput, Proposal } from './proposals.ts';
import { basisOf } from './proposals-basis.ts';
import type { Sketch, SketchItem } from './sketch.ts';
import { throughPoints } from './sketch.ts';
import { sketchMarks, sketchSaid } from './sketch-marks.ts';
import { proposalId } from './steps.ts';
import { word } from './words.ts';

/** Who offers a drawing's proposal: the editor reading the drawing, declared as a step is. */
export const SKETCH_PROPOSER = 'sketch';

type Box = { x: number; y: number; width: number; height: number };
type Target = { id: string; box: Box };

const holds = (b: Box, p: MarkPoint) => p[0] >= b.x && p[0] <= b.x + b.width && p[1] >= b.y && p[1] <= b.y + b.height;

/** The one of `values` given most often, the first such in order; undefined when there are none. */
function most(values: readonly string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | undefined;
  for (const [v, n] of counts) if (best === undefined || n > (counts.get(best) ?? 0)) best = v;
  return best;
}

/** A plain word from a drawing's words, for an id: `Tea break` is `tea_break`. Empty when they hold no letter. */
function idWord(text: string): string {
  // split into words, never trimmed with a pattern that backtracks: a note's words are a person's, of any length
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]/)
    .filter(Boolean);
  let id = words.join('_');
  while (id && !/[a-z]/.test(id.charAt(0))) id = id.slice(1);
  return id;
}

/** A link's type from a drawing's words, `works with` is `WORKS_WITH`; undefined when they are not plain words. */
const typeWord = (text: string | undefined) =>
  text && /^[A-Za-z][A-Za-z0-9 _-]*$/.test(text.trim())
    ? text
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_')
    : undefined;

/**
 * What the drawings over `graph` seem to say, offered as a proposal against the note as it is. `marks` are the graph's
 * drawing as the card shows it, for where each drawing lies. Nothing is written. It says so when they say nothing new.
 */
export function sketchProposal(
  note: string,
  sketch: Sketch,
  marks: readonly DrawMark[],
  opts: { at?: string; shared?: string[] } = {},
): { proposal: Proposal } | { nothing: string } | { refused: string } {
  const graph = sketch.on;
  const texts = gqlBlocks(note).map((b) => b.text);
  const g = readNote(texts, undefined, opts.shared ?? []).world[graph];
  if (!g) return { refused: word('sketch.propose.graph-gone', { graph }) };
  const hidden = new Set(gs.SCHEMA_LABELS);
  const kind = most([...g.nodes.values()].flatMap(([labels]) => [...labels].filter((l) => !hidden.has(l)))) ?? 'Thing';
  const usual = most(g.edges.map((e) => e[1]));
  const held = new Set(g.edges.map(([s, type, t]) => `${s} ${type} ${t}`));
  const { pieces } = sketchMarks(sketch, marks);
  const shapeOf = (item: SketchItem) => pieces.find((p) => p.mark.id === `sketch:${item.id}`)?.mark;
  const changes: ChangeInput[] = [];
  const said = (item: SketchItem) => ({ reason: word('sketch.propose.reason', { said: sketchSaid(item) }) });
  // a new thing for each note, or box or ellipse with words, that is pinned to nothing
  const fresh: Target[] = [];
  const taken = new Set(g.nodes.keys());
  for (const item of sketch.items) {
    const text = item.text?.trim();
    if (!text || item.pin !== undefined || throughPoints(item)) continue;
    const base = idWord(text);
    const m = shapeOf(item);
    if (!base || !m) continue;
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
    taken.add(id);
    const box =
      m.kind === 'box'
        ? m
        : m.kind === 'label'
          ? {
              x: m.x,
              y: m.y - m.size,
              width: Math.max(m.maxWidth ?? 0, text.length * m.size * 0.6),
              height: m.size * 1.4,
            }
          : null;
    if (box) fresh.push({ id, box });
    changes.push(thingChange(id, kind, { name: text }, said(item)));
  }
  // a link for each line, arrow or stroke run from one thing to another; a thing it adds is an end it may run to
  const things: Target[] = marks.flatMap((m) => (m.kind === 'box' && m.of ? [{ id: m.of, box: m }] : []));
  const at = (p: MarkPoint) => (fresh.find((t) => holds(t.box, p)) ?? things.find((t) => holds(t.box, p)))?.id;
  for (const item of sketch.items) {
    const m = throughPoints(item) ? shapeOf(item) : undefined;
    if (m?.kind !== 'link') continue;
    const [from, to] = [m.points[0], m.points[m.points.length - 1]].map((p) => (p ? at(p) : undefined));
    const type = typeWord(item.text) ?? usual ?? 'RELATES_TO';
    if (!from || !to || from === to || held.has(`${from} ${type} ${to}`)) continue;
    held.add(`${from} ${type} ${to}`);
    changes.push(linkChange(from, type, to, {}, said(item)));
  }
  if (!changes.length) return { nothing: word('sketch.propose.nothing', { graph }) };
  const proposal = makeProposal({
    id: proposalId(SKETCH_PROPOSER, texts),
    graph,
    by: { name: SKETCH_PROPOSER, kind: 'step' },
    at: opts.at ?? null,
    read: [sketch.name],
    basis: basisOf(note, graph, opts.shared),
    changes,
  });
  return 'refused' in proposal ? proposal : { proposal };
}
