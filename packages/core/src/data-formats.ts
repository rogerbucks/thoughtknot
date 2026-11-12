// The data formats ThoughtKnot plans to handle, each with the roles it can play (editor spec §67, format_catalogue).
// A role is a source, a file read into cited GQL statements (§63). Or content, the file drawn as a node. Or a view of
// the same file, or an export (§16). Each is `built`, with the code that does it, or `planned`. The design is
// wiki/Data-formats-design.md.
// A format that needs a reader library says so: adding one is Roger's call (format_text_first, RUNTIME_ALLOWED).

/** Where a role of a format stands: built, by the code named, or planned. */
export type RoleState = { built: string } | 'planned' | null;

/** One format and its roles. */
export interface DataFormatEntry {
  /** What the format is called. */
  name: string;
  /** Its files' extensions, without the dot. */
  extensions: string[];
  /** Read with code ThoughtKnot ships (`text`), or only with a reader library Roger accepts first (`library`). */
  reader: 'text' | 'library';
  source: RoleState;
  content: RoleState;
  view: RoleState;
  export: RoleState;
}

const planned = 'planned' as const;
const roles = (source: RoleState, content: RoleState, view: RoleState, out: RoleState) => ({
  source,
  content,
  view,
  export: out,
});

/** Every format planned, in the order the spec names them. */
export const FORMAT_CATALOGUE: readonly DataFormatEntry[] = [
  {
    name: 'Markdown',
    extensions: ['md'],
    reader: 'text',
    ...roles({ built: 'sources.ts' }, planned, planned, { built: 'compose-out.ts' }),
  },
  { name: 'Mermaid', extensions: ['mmd'], reader: 'text', ...roles(planned, planned, planned, planned) },
  {
    name: 'CSV',
    extensions: ['csv'],
    reader: 'text',
    ...roles({ built: 'csv-connector.ts' }, planned, planned, { built: 'export-data-csv.ts' }),
  },
  { name: 'JSON', extensions: ['json'], reader: 'text', ...roles(planned, planned, null, planned) },
  { name: 'Excel', extensions: ['xlsx'], reader: 'library', ...roles(planned, planned, planned, planned) },
  {
    name: 'Word',
    extensions: ['docx'],
    reader: 'library',
    ...roles(planned, planned, planned, { built: 'compose-out.ts' }),
  },
  { name: 'PowerPoint', extensions: ['pptx'], reader: 'library', ...roles(planned, planned, null, planned) },
  { name: 'PDF', extensions: ['pdf'], reader: 'library', ...roles(planned, planned, planned, null) },
  {
    name: 'Images',
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
    reader: 'text',
    ...roles(planned, { built: 'display/graph-view/image-views.ts' }, planned, null),
  },
  {
    name: 'GraphML',
    extensions: ['graphml'],
    reader: 'text',
    ...roles(planned, null, null, { built: 'export-data-graphml.ts' }),
  },
  { name: 'DOT', extensions: ['dot', 'gv'], reader: 'text', ...roles(planned, null, null, planned) },
  { name: 'GEXF', extensions: ['gexf'], reader: 'text', ...roles(planned, null, null, planned) },
  { name: 'OPML', extensions: ['opml'], reader: 'text', ...roles(planned, planned, null, planned) },
  {
    name: 'SQLite',
    extensions: ['sqlite', 'sqlite3', 'db'],
    reader: 'library',
    ...roles(planned, planned, null, null),
  },
  { name: 'Cypher', extensions: ['cypher', 'cql'], reader: 'text', ...roles(planned, null, null, planned) },
  {
    name: 'GQL',
    extensions: ['gql'],
    reader: 'text',
    ...roles({ built: 'connectors.ts' }, null, null, { built: 'export-data-gql.ts' }),
  },
  {
    name: 'HTML',
    extensions: ['html', 'htm'],
    reader: 'text',
    ...roles({ built: 'html-read.ts' }, planned, planned, { built: 'compose-out.ts' }),
  },
];

/** The format a file is, by its extension, or undefined when none in the catalogue is. */
export const formatOf = (path: string): DataFormatEntry | undefined => {
  const ext = /\.([^./]+)$/.exec(path)?.[1]?.toLowerCase() ?? '';
  return FORMAT_CATALOGUE.find((f) => f.extensions.includes(ext));
};
