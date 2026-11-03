// The words of intents, in UK English (editor spec §42, words_catalogue; §58, intent_standing). They say an intent's
// standing in words and counts, never as a score. They say how each thing pulls on an intent shown over a view.
// views-source-words.ts keeps them with the view words.

/** The words of an intent's standing, by key, in UK English. */
export const INTENT_SOURCE_WORDS = {
  'intent.standing': '{says}: {parts}.',
  'intent.supported-by': { one: 'supported by {count} ({words})', other: 'supported by {count} ({words})' },
  'intent.supported-by-none': 'nothing supports it',
  'intent.contradicted-by': { one: 'contradicted by {count} ({words})', other: 'contradicted by {count} ({words})' },
  'intent.contradicted-by-none': 'nothing contradicts it',
  'intent.by-word': '{count} {likelihood}',
  'intent.contested': { one: '{count} thing pulls both ways', other: '{count} things pull both ways' },
  'intent.unlinked': { one: '{count} thing not linked', other: '{count} things not linked' },
  // an intent shown over a view: each thing's mark, said in the legend and to a screen reader (intent-overlay.ts)
  'intent.pull.supports': 'Supports: {says}',
  'intent.pull.contradicts': 'Goes against: {says}',
  'intent.pull.contested': 'Pulls both ways on: {says}',
  'intent.pull.unlinked': 'Not linked to: {says}',
  // the list beside the drawing that picks the intent shown (display/graph-view/intent-pick.ts)
  'intent.show': 'Show an intent',
  'intent.show.none': 'None',
} as const;
