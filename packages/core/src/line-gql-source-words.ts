// The words of loose lines to GQL, in UK English (editor spec §42, words_catalogue; §47, line_to_gql_offer). They name
// the offer beside a line, and say why a line is not converted. ai-source-words.ts keeps them with the other AI words.

/** The words of loose lines to GQL, by key, in UK English. */
export const LINE_GQL_SOURCE_WORDS = {
  'line-gql.offer': 'Convert to GQL',
  'line-gql.offer-ai': 'Convert with AI',
  'line-gql.fix': 'Convert to GQL: {gql}',
  'line-gql.offer-tip': 'This line is not GQL yet. See the GQL it would become, and accept it or not.',
  'line-gql.not-loose': 'This line is GQL already, or is not in a graph block: there is nothing to convert.',
  'line-gql.no-shape':
    'No shape the editor knows fits this line, so code cannot convert it. Convert it with AI instead.',
  'line-gql.not-read': 'The GQL this line would become cannot be read: {why}',
  'line-gql.problem': 'The GQL this line would become adds a problem: {why}',
  'line-gql.nothing-new': 'Everything this line says is in the graph already.',
  'line-gql.review': 'Convert the line to GQL',
  'line-gql.review-was': 'The line as typed:',
  'line-gql.review-becomes': 'It becomes:',
  'line-gql.accept': 'Accept',
  'line-gql.changed': 'The line was changed meanwhile, so nothing was written. Convert it again.',
  'line-gql.question': 'Convert this one line of a graph block into the things, kinds and links it names.',
} as const;
