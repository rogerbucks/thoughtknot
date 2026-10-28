// Drawing a graph (spec §3). It is laid out by the Graphviz engine in each direction the style lists. The better fit is
// chosen and themed, as graph_svg.render does. Also what tapping a box shows. The engine itself is started by engine.ts
// and handed in, so these steps need no WebAssembly and run in any host (spec §10).
import GraphLayout from '@thoughtknot/graph-spec/src/graph-layout.js';
import type { GraphDrawing, NoteReading, Problem } from './note-reading.ts';
import { drawingSource, layoutSource, STYLE } from './layout.ts';
import type { LayoutSource } from './layout.ts';
import { themed, sizeOf, choose } from './theme.ts';
import type { Palette } from './palette.ts';
import { nudgedSource } from './style-source.ts';
import { arrowlessSource } from './arrows.ts';
import { inlineSource } from './inline-properties.ts';
import { foldedSource, routedSource } from './fold-source.ts';
import { flowSource } from './link-flow.ts';
import { pictureSource } from './picture.ts';
import type { LaidMarks } from './graphviz-marks.ts';
import { layoutSvg } from './graphviz-svg.ts';
import { directLinks } from './direct-links.ts';
import { marksInRows } from './layouts/rows-route.ts';
import { groupsIn, kindsIn, lanesIn, optionsIn, ownable, ownSource, ownSvg, stepIn } from './layouts/own-draw.ts';

/** Graphviz: layout source in, SVG text out. Throws when it cannot lay the source out. */
export interface Engine {
  version: string;
  render(source: string): string;
  /** The same layout as drawing marks (spec §43), for a host that draws marks itself. */
  marks?(source: string): LaidMarks;
  /** The marks with every box where the source puts it, measured but not laid out, for our own engine (§53). */
  placed?(source: string): LaidMarks;
}

/** A drawing ready to show: themed SVG text, the direction chosen, and its natural size in CSS pixels. */
export interface Drawn {
  svg: string;
  rankdir: string;
  width: number;
  height: number;
  /** Shown right to left: laid out across and mirrored after, for a right-to-left language (drawing-direction.ts). */
  mirrored?: boolean;
  /**
   * A quick first picture's settled layout, still coming (§68, layout_live_loop). It is null when no longer wanted, or
   * when it could not settle; the quick picture then stays.
   */
  better?: Promise<Drawn | null>;
}

/** One direction to lay a drawing out in: the source handed to Graphviz, and the kinds and readings to theme it by. */
export interface Direction {
  rankdir: string;
  dot: string;
  src: LayoutSource;
  /** Laid out by our own engine (layout_own_engine): Graphviz only measures it (layouts/own-draw.ts). */
  own?: boolean;
}

/**
 * Past this many things a graph is laid out quickly (spec §11, large_drawn_quick): once, in one direction, with the
 * quick settings below. Take a graph with a tree and cross links, laid out in full one way on a desktop. It took
 * about a second at 400 things, 15 at 1,000 and 48 at 2,000. Both ways took twice that, and a phone is slower still.
 * The quick way took under one second at 1,000 and about three at 2,000. 300 is also the most the page's own thread
 * draws (layout-limits.ts), so a graph drawn there is laid out in full.
 */
export const QUICK_LAYOUT = 300;

/**
 * Graphviz's quick settings. Placing the boxes in each row stops early
 * (`nslimit=0.5`). Uncrossing the links tries a twentieth as hard
 * (`mclimit=0.05`). The rows are kept, so the drawing still reads in order. The routing a person chose is written
 * after, so it still wins (`routedSource`). Never `nslimit=0`: Graphviz stopped on an assertion with it.
 */
const QUICK_SETTINGS = '  graph [nslimit=0.5, mclimit=0.05];';

/** The source with the quick settings added after its first line, as `routedSource` adds its own. */
function quickSource(dot: string): string {
  const lines = dot.split('\n');
  lines.splice(1, 0, QUICK_SETTINGS);
  return lines.join('\n');
}

/**
 * What Graphviz is handed for a drawing. It is one source for each direction the style lists, in the style's order. Or
 * it is only the drawing's own direction, when it was given one of those (spec §21, settings_formatting; a direction
 * nudge, §6). Or else it is only its diagram type's direction (§15: a tree down, the other types across). A graph of
 * more than `QUICK_LAYOUT` things is laid out in only the first, with the quick settings (§11, large_drawn_quick).
 */
export function directions(drawing: GraphDrawing): Direction[] {
  const own = drawing.direction && STYLE.directions.includes(drawing.direction) ? drawing.direction : undefined;
  const only = own ?? (drawing.diagram ? GraphLayout.typeDirection(drawing.diagram) : undefined);
  const keys = drawing.boxes.map((b) => b.key);
  const quick = drawing.boxes.length > QUICK_LAYOUT;
  // our own engine picks rows or spread by the graph's shape. It tries each direction as Graphviz does, and the
  // drawing that fits the note best is shown. A drawing whose layout ran out of time is laid out by a cheaper step,
  // whatever its routing and type (layout_never_text). Rows and a grid are tried one way only
  const { step } = drawing;
  const ours =
    step || (drawing.engine === 'own' && !drawing.diagram && (!drawing.routing || drawing.routing === 'direct'));
  const cheap = quick || (step && step !== 'own');
  const ways = only ? [only] : cheap ? STYLE.directions.slice(0, 1) : STYLE.directions;
  const kindsByKey = new Map(drawing.boxes.flatMap((b) => (b.kind ? [[b.key, b.kind] as const] : [])));
  return ways.map((rankdir) => {
    const src = layoutSource(drawing, rankdir as 'LR' | 'TB');
    // the diagram type chosen (§15), the links moved (§7) and the style graph's arrowheads hidden (§15). Then
    // properties shown (§14), room for the pictures on boxes (§18) and nudges written in (§6). Then what the View menu
    // folds and merges and how the links are routed (§25). With none of them, the source the Python library gives, byte
    // for byte
    const dot = routedSource(
      foldedSource(
        nudgedSource(
          pictureSource(
            inlineSource(
              arrowlessSource(
                flowSource(
                  GraphLayout.typedSource(drawingSource(drawing, rankdir as 'LR' | 'TB', src), drawing.diagram, STYLE),
                  drawing.flow ?? [],
                ),
                drawing.arrowless ?? [],
              ),
              drawing.inline,
            ),
            drawing.pictures,
          ),
          drawing.nudges ?? [],
          keys,
          drawing.diagram,
        ),
        drawing.folding,
      ),
      drawing.routing,
    );
    if (ours && ownable(dot))
      return {
        rankdir,
        dot: ownSource(dot, drawing.layoutOptions, kindsByKey, drawing.kindLanes !== false, step),
        src,
        own: true,
      };
    return { rankdir, dot: quick ? quickSource(dot) : dot, src };
  });
}

/**
 * The drawing, from the SVG Graphviz drew for each direction (in the same order). It is the better fit, themed in the
 * host's palette from the one table (Obsidian's by default).
 */
export function chosen(laidOut: Direction[], svgs: string[], palette?: Palette): Drawn {
  const laid = laidOut.map(({ rankdir, src }, i) => {
    const svg = svgs[i] ?? '';
    return { rankdir, ...sizeOf(svg), svg, src };
  });
  const best = choose(laid);
  return {
    svg: themed(best.svg, best.src.kinds, best.src.readings, palette),
    rankdir: best.rankdir,
    width: best.width,
    height: best.height,
  };
}

/**
 * Lays a graph out in each direction the style lists and themes the one that fits the note best. Graphviz numbers the
 * boxes node1, node2… and the links edge1, edge2… in the drawing's order, so each can be found again by its place.
 * The layout worker (layout-worker.ts) draws through the same two steps, so a drawing is the same wherever it is laid out.
 */
export function draw(drawing: GraphDrawing, engine: Engine): Drawn {
  const laid = directions(drawing);
  return chosen(
    laid,
    laid.map((d) => svgOf(engine, d.dot, drawing.routing, d.own)),
  );
}

/**
 * The SVG Graphviz draws from `dot`. Direct links are the default. With them (§25, untangle_direct) it is drawn from
 * Graphviz's layout as marks, its links made direct and its boxes moved aside (direct-links.ts). It is Graphviz's own
 * where the marks cannot give the drawing back exactly, or the engine gives no marks.
 */
export function svgOf(engine: Engine, dot: string, routing?: string, own?: boolean): string {
  // our own engine places the boxes Graphviz measured (layout_own_engine); Graphviz's own layout where it cannot
  if (own && engine.placed) {
    const measured = engine.placed(dot);
    if (!measured.layout?.lost)
      return ownSvg(
        measured,
        /rankdir=(\w+)/.exec(dot)?.[1] ?? 'LR',
        groupsIn(dot),
        optionsIn(dot),
        kindsIn(dot),
        lanesIn(dot),
        stepIn(dot),
      );
  }
  // direct is the default. Curved is drawn by our own router; any other routing is Graphviz's own (Roger, 24 Oct 2026)
  const curved = routing === 'curved';
  if ((routing !== undefined && routing !== 'direct' && !curved) || !engine.marks) return engine.render(dot);
  // its links are drawn again here, so Graphviz lays them out straight. Its curves would be thrown away, and routing
  // them is about a quarter of its work. Every box lands where it would have (curves_not_routed)
  const laid = engine.marks(routedSource(dot, 'direct'));
  if (laid.layout?.lost) return engine.render(dot);
  // past the quick size, moving boxes off links no longer keeps them clear. So our own router routes each link
  // between the rows Graphviz laid out, and no box moves (links_routed_in_rows)
  const way = /rankdir=(TB|BT)/.test(dot) ? 'TB' : 'LR';
  const large = laid.marks.filter((m) => m.kind === 'box' && m.role === 'thing').length > QUICK_LAYOUT;
  // curved links a person chose are routed that way at any size, at once (curves_routed_ours). A drawing laid out in
  // no rows, such as a radial one, keeps Graphviz's own curves while small. Past the quick size routing them is slow,
  // so its links are drawn direct
  const rows = !/\blayout=/.test(dot) && marksInRows(laid.marks, way === 'TB' ? 1 : 0);
  if (curved && !rows && !large) return engine.render(dot);
  return layoutSvg(directLinks(laid, undefined, undefined, way, rows && (large || curved)));
}

/** One link in or out of a box, as its details list it. */
export interface LinkDetail {
  reading: string;
  key: string;
  text: string;
}

/** What tapping a box shows: its text, its kind, its links in and out with the thing at the other end, and its problems. */
export interface Details {
  key: string;
  text: string;
  kind: string;
  out: LinkDetail[];
  in: LinkDetail[];
  problems: Problem[];
  /** For a thing written without a name and drawn under the one suggested (spec §4): the warning, whose fix writes it. */
  suggested?: Problem;
}

const names = (line: string, key: string) =>
  new RegExp(`(^|[^A-Za-z0-9_])${key.replace(/[^A-Za-z0-9_]/g, '\\$&')}([^A-Za-z0-9_]|$)`).test(
    line.replace(/\/\/.*$/, ''),
  );

/** What tapping a box shows: its text, kind, links in and out, and any problem on it; null if it is not drawn. */
export function details(reading: NoteReading, graph: string, key: string): Details | null {
  const d = reading.graphs.get(graph),
    box = d?.boxes.find((b) => b.key === key);
  if (!d || !box) return null;
  const textOf = (k: string) => d.boxes.find((b) => b.key === k)?.text ?? k;
  // a thing drawn under a suggested name is not written by it: its warning is found by the name it suggests
  const suggested = box.suggested
    ? reading.problems.find((p) => p.graph === graph && p.suggested === key && p.block === box.suggested?.block)
    : undefined;
  return {
    key,
    text: box.text,
    kind: box.kind,
    out: d.links.filter((l) => l.from === key).map((l) => ({ reading: l.reading, key: l.to, text: textOf(l.to) })),
    in: d.links.filter((l) => l.to === key).map((l) => ({ reading: l.reading, key: l.from, text: textOf(l.from) })),
    problems: reading.problems.filter(
      (p) =>
        p === suggested || (p.graph === graph && names(reading.texts[p.block]?.split('\n')[p.line - 1] ?? '', key)),
    ),
    ...(suggested ? { suggested } : {}),
  };
}

/** What tapping a link shows: its type and reading, the things at either end, its properties, and its problems. */
export interface LinkDetails {
  index: number;
  type: string;
  reading: string;
  from: { key: string; text: string };
  to: { key: string; text: string };
  /** Each property as [name, value in words], by name. */
  properties: [string, string][];
  problems: Problem[];
}

const said = (v: unknown): string => (v && typeof v === 'object' && 's' in v ? String(v.s) : String(v));

/** The details of the drawing's `index`-th link (in the order written), or null when there is none. */
export function linkDetails(reading: NoteReading, graph: string, index: number): LinkDetails | null {
  const d = reading.graphs.get(graph),
    l = d?.links[index],
    g = reading.world[graph];
  if (!d || !l || !g) return null;
  const drawn = new Set(d.boxes.map((b) => b.key)),
    textOf = (k: string) => d.boxes.find((b) => b.key === k)?.text ?? k;
  // a link that says which written link it is (a view's) has that link's properties; otherwise, by its place
  const edge =
    l.edge !== undefined ? g.edges[l.edge] : g.edges.filter(([s, , t]) => drawn.has(s) && drawn.has(t))[index];
  const props = edge?.[3] ?? {};
  return {
    index,
    type: l.type,
    reading: l.reading,
    from: { key: l.from, text: textOf(l.from) },
    to: { key: l.to, text: textOf(l.to) },
    properties: Object.entries(props)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => [k, said(v)]),
    problems: reading.problems.filter((p) => {
      const line = reading.texts[p.block]?.split('\n')[p.line - 1] ?? '';
      return p.graph === graph && names(line, l.from) && names(line, l.to) && names(line, l.type);
    }),
  };
}
