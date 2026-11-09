// The words of text to graph, in UK English (editor spec §42, words_catalogue; §47). They say why a text or an answer
// is refused, and write where each proposed thing and link came from in the text. ai-source-words.ts keeps them with
// the other AI words.

/** The words of text to graph, by key, in UK English. */
export const AI_TEXT_GRAPH_SOURCE_WORDS = {
  'ai.text-graph.no-text': 'Choose some text first: there is nothing to make a graph of.',
  'ai.text-graph.too-long': 'The text has {count} characters. Text to graph takes at most {most}: choose less of it.',
  'ai.text-graph.graph-name': 'A graph name is one word of letters, digits and underscores.',
  'ai.text-graph.question': 'Make a graph of the things, kinds and links this text names.',
  'ai.text-graph.no-list': 'The answer holds no list of things and links, or holds something else too.',
  'ai.text-graph.too-many': 'The answer names more than {most} things or links. Choose less text.',
  'ai.text-graph.thing': 'Thing {n} needs a name and a kind, each one word, and a text and aliases that are text.',
  'ai.text-graph.author': 'Thing {n} is of a kind only the editor writes.',
  'ai.text-graph.twice': 'The answer names {name} twice.',
  'ai.text-graph.link': 'Link {n} needs a from, a type and a to, each one word.',
  'ai.text-graph.link-ends': 'Link {n} joins a thing that is neither in the answer nor in the graph.',
  'ai.text-graph.provenance': 'Link {n} is of a type only the editor writes.',
  'ai.text-graph.no-quote': '{what} {n} gives no words of the text it came from, or words the text does not hold.',
  'ai.text-graph.thing-word': 'Thing',
  'ai.text-graph.link-word': 'Link',
  'ai.text-graph.invalid': 'The graph the answer makes has a problem, so nothing is shown: {why}',
  'ai.text-graph.nothing-new': 'Everything the answer names is already in the graph.',
  'ai.text-graph.from': 'from the text, characters {from} to {to}: "{words}"',
  'ai.text-graph.joins': '{from}; joins {things}, already in the graph',
  'ai.text-graph.matched': '{name} is {thing}, already in the graph (by {by})',
  'ai.text-graph.graph-row': 'The graph the text goes into: one the note has, or a new name.',
  'ai.text-graph.text-row': 'The text sent, {count} characters: the selection, or the note without its graph blocks.',
  'ai.text-graph.text-row-file': 'The text sent, {count} characters: the file {place}.',
  'ai.text-graph.review': 'Keep what the AI found for graph {graph}',
  'ai.text-graph.review-sentence':
    'This note has no such graph yet. Tick what to keep: only that is written, into a new graph block.',
  'ai.text-graph.write': 'Write the ticked ones',
  'ai.text-graph.written': '{count} changes written into graph {graph}.',
} as const;
