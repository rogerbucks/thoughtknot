// A picture of a graph for readers without ThoughtKnot. That is editor spec §62: picture_for_readers,
// picture_self_explaining, picture_big_graph, picture_classified and picture_never_read. It is the export's image (§16)
// of the whole graph, with its title, legend and drawings. It is in the light theme's fixed colours on its own page, so
// it reads on a light or a dark page.
// Its foot says ThoughtKnot drew it, from which note and when. Its description, and the alt text of its image line, is
// the plain-language reading (screen_reader_text) cut to ALT_MOST characters. It names itself as ThoughtKnot's with the
// fingerprint of the text it was drawn from (reader-picture-note.ts). A graph too large for one readable picture is its
// overview, saying how many things are left out. A note classified above the level set gets none until the user says
// yes, as an export asks. The picture is made from the text and never read back.
//
// Host-free: the host hands in its layout, as for an export, and writes the file only when its bytes change.
import type { Graph } from '@thoughtknot/graph-spec';
import { exportWithLayout } from './export.ts';
import type { ExportLayout } from './export.ts';
import { framed, saidDate } from './export-frame.ts';
import { exportPlan } from './export-plan.ts';
import { exportScope } from './export-scope.ts';
import { gqlBlocks } from './fences.ts';
import { graphOfBlock, isSourceBlock, isStepBlock } from './blocks.ts';
import { readNote } from './drawing.ts';
import { changeSetId } from './proposals-text.ts';
import { sketchInNote } from './sketch-edit.ts';
import { readStyle } from './style.ts';
import { viewsOf } from './views.ts';
import { textVersion } from './help.ts';
import type { NoteReading } from './note-reading.ts';
import { overviewPicture } from './overview-svg.ts';
import { PALETTES } from './palette.ts';
import {
  pictureAlt,
  pictureFileName,
  pictureFingerprint,
  pictureLine,
  pictureLines,
  pictureMark,
  pictureTexts,
  withoutPictureLines,
} from './reader-picture-note.ts';
import type { Settings } from './settings.ts';
import type { Sketch } from './sketch.ts';
import type { StyleGraph } from './style-graph.ts';
import { sourceWord } from './words.ts';

/** The most things a picture draws one by one; past it, the picture is the graph's overview (picture_big_graph). */
export const PICTURE_MOST_THINGS = 300;

/** The widest an overview is drawn, in CSS pixels. */
const OVERVIEW_WIDTH = 800;

/** What a picture is made from. */
export interface PictureInput {
  reading: NoteReading;
  graph: string;
  /** The note's path in the vault. */
  note: string;
  /** The note's whole text, for the fingerprint of the blocks the picture is drawn from. */
  text: string;
  /** The day it is drawn, `YYYY-MM-DD`. */
  date: string;
  /** The host's layout, the one its drawings and exports go through. */
  layout: ExportLayout;
  /** The note's classification (front matter `classification:`); null when it has none. */
  noteClassification: string | null;
  settings: Pick<Settings, 'classifications' | 'exportAsksAbove'>;
  /** Set once the user has said yes to drawing a picture of a classified note. */
  confirmed?: boolean;
  /** The drawings over the graph (§70), drawn on top as in an export (sketch_reader_picture). */
  sketch?: Sketch | null;
  /** The graph's style and its values, for its looks, legend and the properties it shows inline. */
  styled?: { style: StyleGraph; data: Graph };
}

/** A picture made: its SVG, its alt text, the image line that links it, its file name and fingerprint. */
export interface ReaderPicture {
  svg: string;
  alt: string;
  fingerprint: string;
  fileName: string;
  /** The image line, given the link from the note to where the host writes the file. */
  line: (href: string) => string;
  /** Whether it is the overview of a graph too large to draw one thing at a time. */
  overview: boolean;
}

/** No picture, and why (a sentence); a question to ask first; or the picture. Null when the layout is no longer wanted. */
export type PictureDecision = { nothing: string } | { ask: string } | { picture: ReaderPicture } | null;

/** Text made safe inside an SVG element. */
const escaped = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** `svg` named as ThoughtKnot's picture, its description the alt text in place of the export's. */
function marked(svg: string, fingerprint: string, alt: string): string {
  const open = svg.indexOf('>') + 1;
  const withMark = `${svg.slice(0, open)}\n${pictureMark(fingerprint)}${svg.slice(open)}`;
  // found by its tags, never a pattern that could take a long time over a large drawing
  const from = withMark.indexOf('<desc>'),
    close = withMark.indexOf('</desc>', from);
  if (from < 0 || close < 0) return withMark;
  return `${withMark.slice(0, from)}<desc>${escaped(alt)}${withMark.slice(close)}`;
}

/** The overview of a graph too large to draw, framed as an export is, with a line counting what it leaves out. */
function overviewImage(input: PictureInput, footer: string) {
  const drawing = input.reading.graphs.get(input.graph);
  if (!drawing) return null;
  const palette = PALETTES.light;
  let groups = 0;
  const { svg } = overviewPicture(drawing, palette, (n) => ((groups = n), []));
  const box = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg);
  const w = Number(box?.[1] ?? OVERVIEW_WIDTH),
    h = Number(box?.[2] ?? OVERVIEW_WIDTH),
    width = Math.min(OVERVIEW_WIDTH, w);
  const subtitle = sourceWord('picture.overview', {
    things: sourceWord('picture.things', { count: drawing.boxes.length }),
    groups: sourceWord('picture.groups', { count: groups }),
  });
  return framed({ svg, width, height: (h * width) / w }, { title: input.graph, subtitle, legend: [], footer }, palette)
    .svg;
}

/**
 * The reader picture of `input.graph`, or why there is none, or the question to ask first. An empty graph has none. A
 * note classified above the level set is asked about until `confirmed`. A graph past PICTURE_MOST_THINGS, or one its
 * layout refuses, is drawn as its overview. The same text, note and day give the same bytes on every host.
 */
export async function readerPicture(input: PictureInput): Promise<PictureDecision> {
  const scope = exportScope(input.reading, { graph: input.graph });
  const plan = exportPlan({
    scope,
    format: 'svg',
    note: input.note,
    date: input.date,
    noteClassification: input.noteClassification,
    settings: { ...input.settings, exportFolder: '', companionNote: 'off' },
    ...(input.confirmed ? { confirmed: true } : {}),
  });
  if ('nothing' in plan || 'ask' in plan) return plan;
  const fingerprint = pictureFingerprint(input.note, pictureTexts(input.text, input.graph));
  const alt = pictureAlt(textVersion(scope.drawing));
  const footer = sourceWord('picture.footer', { note: input.note, date: saidDate(input.date) });
  let svg: string | null = null;
  if (scope.drawing.boxes.length <= PICTURE_MOST_THINGS) {
    const info = { note: input.note, date: input.date, theme: 'light', sketch: input.sketch ?? null, footer } as const;
    const image = await exportWithLayout(scope, input.layout, input.styled ? { ...info, ...input.styled } : info);
    if (image === null) return null;
    if ('svg' in image) svg = image.svg;
  }
  const overview = svg === null;
  svg ??= overviewImage(input, footer);
  if (svg === null) return null;
  return {
    picture: {
      svg: `${marked(svg, fingerprint, alt)}\n`,
      alt,
      fingerprint,
      fileName: pictureFileName(input.note, input.graph),
      line: (href) => pictureLine(alt, href),
      overview,
    },
  };
}

/** A block of a note that gets a picture: its index among the note's gql blocks, and the graph it draws. */
export interface PictureBlock {
  block: number;
  graph: string;
}

/**
 * The blocks of `note` that get a picture: the first block of each graph that ThoughtKnot draws as that graph. A view,
 * a block drawn from elsewhere, a step, a proposal, a style, a drawings block and a schema alone get none.
 */
export function pictureBlocks(note: string): PictureBlock[] {
  const seen = new Set<string>();
  return gqlBlocks(note).flatMap((b, block) => {
    const t = b.text,
      graph = graphOfBlock(t);
    if (!graph || seen.has(graph) || viewsOf([t]).length || isSourceBlock(t) || isStepBlock(t) || changeSetId(t))
      return [];
    seen.add(graph);
    return [{ block, graph }];
  });
}

/** The 0-based lines of `note` that are picture lines after a block ThoughtKnot draws, which a host hides (§62). */
export function drawnPictureLines(note: string): number[] {
  const drawn = new Set(pictureBlocks(note).map((b) => b.block));
  return pictureLines(note)
    .filter((p) => drawn.has(p.block))
    .map((p) => p.line);
}

/** `note` without the picture lines after the blocks ThoughtKnot draws, for a host that shows the rest as Markdown. */
export function withoutDrawnPictures(note: string): string {
  const drawn = new Set(pictureBlocks(note).map((b) => b.block));
  return withoutPictureLines(note, (p) => drawn.has(p.block));
}

/** What the pictures of a whole note are made from: `PictureInput` but the graph, reading and drawings, read here. */
export type NotePicturesInput = Omit<PictureInput, 'reading' | 'graph' | 'sketch' | 'styled'> & {
  /** The shared schemas of the vault (§5), as the note's drawing reads them. */
  shared?: string[];
};

/**
 * The picture of each block of the note that gets one, each with its decision, in the note's order. Its style, values
 * and drawings are read from the note as its card reads them. A note too large to read gets none.
 */
export async function notePictures(
  input: NotePicturesInput,
): Promise<(PictureBlock & { decision: PictureDecision })[]> {
  const texts = gqlBlocks(input.text).map((b) => b.text);
  const reading = readNote(texts, texts.length - 1, input.shared ?? []);
  if (reading.tooLarge) return [];
  const out: (PictureBlock & { decision: PictureDecision })[] = [];
  for (const at of pictureBlocks(input.text)) {
    const data = reading.world[at.graph];
    const decision = await readerPicture({
      ...input,
      reading,
      graph: at.graph,
      sketch: sketchInNote(input.text, at.graph)?.sketch ?? null,
      ...(data ? { styled: { style: readStyle(texts, at.graph, reading).style, data } } : {}),
    });
    out.push({ ...at, decision });
  }
  return out;
}
