// Format plug-ins (editor spec §67, format_plugin_contracts, format_parallel_views; DF1; Roger, 25 Oct 2026).
// A new data format adds plug-ins. It never changes the join, the layouts or the details panel.
// - Three contracts. A source plug-in turns a file's text into GQL statements, each with the line it was read on. A
//   content plug-in gives the file as one node: its size and its marks. A layout plug-in places things (§15).
// - A format is found by its file's extension. It may bring one plug-in of each contract, or only some.
// - Parallel views. One file gives a graph view and a content view together, both citing the hash of the same text.
//   Turning one off leaves the other as it was, because each is made from the file alone.
// - Any layout. A graph read from a format is the same Connected a .gql file gives, so the join and every layout take
//   it. A content node reports its size, so a layout needs to know no format.
// Host-free and pure.
import { sha256 } from './ai-digest.ts';
import type { Connected, Statement } from './connectors.ts';
import { gqlConnector } from './connectors.ts';
import type { DrawMark } from './drawing-marks.ts';
import type { Layout } from './layouts/layouts.ts';
import type { Fetched, Source, SourceRefusal } from './sources.ts';
import { word } from './words.ts';

/** A statement a source plug-in read, with the line it starts on in the file (1-based). */
export interface FormatStatement {
  text: string;
  line: number;
}

/** The first contract: a file's text as GQL statements. */
export interface FormatSource {
  read(text: string): FormatStatement[];
}

/** A content node: its size, and its marks with its top left corner at 0, 0. */
export interface ContentNode {
  width: number;
  height: number;
  marks: DrawMark[];
}

/** The second contract: a file as one node, in 2D and in 3D alike (marks are the one picture format). */
export interface FormatContent {
  node(id: string, name: string, text: string): ContentNode;
}

/** One format, by its plug-ins. */
export interface FormatPlugin {
  /** What the format is called. */
  format: string;
  /** Its files' extensions, without the dot, in lower case. */
  extensions: readonly string[];
  source?: FormatSource;
  content?: FormatContent;
  /** The third contract: layouts this format brings, offered beside the built-in ones. */
  layouts?: readonly Layout[];
}

const registered: FormatPlugin[] = [];

/** Adds a format. The function it gives takes it away again. */
export function registerFormat(plugin: FormatPlugin): () => void {
  registered.push(plugin);
  return () => {
    const at = registered.indexOf(plugin);
    if (at >= 0) registered.splice(at, 1);
  };
}

/** The format whose plug-ins read this file, by its extension; none for a file no plug-in reads. */
export function pluginFormatOf(path: string): FormatPlugin | undefined {
  const ext = /\.([^./]+)$/.exec(path)?.[1]?.toLowerCase();
  return ext ? registered.find((p) => p.extensions.includes(ext)) : undefined;
}

/** Every layout the registered formats bring. */
export const formatLayouts = (): Layout[] => registered.flatMap((p) => [...(p.layouts ?? [])]);

/** A statement text with the opening `INSERT` of a graph block's first line, the join reads it as GQL. */
const asGql = (graph: string, statements: readonly FormatStatement[]) =>
  `// graph: ${graph}\nINSERT\n${statements.map((s) => s.text).join(',\n')}`;

/**
 * The graph a file gives by its format's source plug-in, as the connector contract has it. It has the place, the hash
 * of the file's text, and each statement citing the place, the version and the line read in the file. The join and
 * every layout take it as they take a .gql file's. Refused where no plug-in reads the file.
 */
export function formatGraph(source: Source, fetched: Fetched): Connected | SourceRefusal {
  const place = source.target;
  const plugin = pluginFormatOf(place);
  if (!plugin?.source) return { source, why: 'unreadable', refused: word('reading.source.no-connector', { place }) };
  if (!('text' in fetched))
    return {
      source,
      why: 'missing',
      refused: word('reading.source.missing-file', { name: place, graph: source.graph }),
    };
  const version = sha256(fetched.text);
  const read = plugin.source.read(fetched.text);
  const connected = gqlConnector.connect(
    { ...source, kind: 'plugin', scheme: plugin.format, target: place },
    { found: place, text: asGql(source.graph, read) },
  );
  if ('refused' in connected) return connected;
  const statements: Statement[] = read.map((s) => ({ text: s.text, cite: { place, version, line: s.line } }));
  return { ...connected, source, place, version, statements };
}

/** The views one file gives at once: each from its own plug-in, each citing the one version of the file. */
export interface FormatViews {
  place: string;
  /** The hash of the file's text, which every view cites. */
  version: string;
  graph?: Connected | SourceRefusal;
  content?: ContentNode;
}

/** The two views of a file. */
export type FormatView = 'graph' | 'content';

/**
 * Every view the file's format gives, side by side, except those in `off`. A view is made from the file's text alone, so
 * turning one off never changes another. A file no plug-in reads gives neither.
 */
export function formatViews(source: Source, text: string, off: ReadonlySet<FormatView> = new Set()): FormatViews {
  const place = source.target;
  const plugin = pluginFormatOf(place);
  return {
    place,
    version: sha256(text),
    graph: plugin?.source && !off.has('graph') ? formatGraph(source, { found: place, text }) : undefined,
    content: plugin?.content && !off.has('content') ? plugin.content.node(`file:${place}`, place, text) : undefined,
  };
}
