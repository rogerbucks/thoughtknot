// The words of AI suggestions, in UK English (editor spec §42, words_catalogue; §59). They say why a suggestion request
// or an answer is refused, name the groups suggestions are reviewed in, and write each suggestion's reason.
// ai-source-words.ts keeps them with the other AI words.

/** The words of AI suggestions, by key, in UK English. */
export const AI_SUGGEST_SOURCE_WORDS = {
  'ai.suggest.no-ask': 'Say what you want suggested first: nothing is suggested unasked.',
  'ai.suggest.names': 'A property, a kind or an intent is one word of letters, digits and underscores, and never id.',
  'ai.suggest.no-graph': 'This note has no graph {graph}.',
  'ai.suggest.no-intent': '{intent} is not an Intent in the graph {graph}.',
  'ai.suggest.no-list': 'The answer holds no list of suggestions, or holds something else too.',
  'ai.suggest.none': 'The model suggested nothing new.',
  'ai.suggest.not-object': 'Suggestion {n} is not a suggestion.',
  'ai.suggest.not-asked': 'Suggestion {n} is for a thing that was not asked about or not sent.',
  'ai.suggest.certainty': 'Suggestion {n} has no certainty word. It must be one of: {words}.',
  'ai.suggest.read': 'Suggestion {n} says it read something that was not sent.',
  'ai.suggest.side': 'Suggestion {n} neither supports nor contradicts the intent.',
  'ai.suggest.value': 'Suggestion {n} has no value, or a value that was not offered.',
  'ai.suggest.twice': 'The answer suggests twice for {thing}.',
  'ai.suggest.group-value': '{key} {value}',
  'ai.suggest.group-supports': 'Supports {intent}',
  'ai.suggest.group-contradicts': 'Contradicts {intent}',
  'ai.suggest.reason': '{certainty}, read {read}: {why}',
  'ai.suggest.preview-mark': 'suggested, not applied',
  'ai.suggest.preview-legend': 'Suggested by an AI, not applied: a dashed line',
} as const;
