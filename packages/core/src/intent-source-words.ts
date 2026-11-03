// The words of intents, in UK English (editor spec §42, words_catalogue; §58, intent_standing). They say an intent's
// standing in words and counts, never as a score. views-source-words.ts keeps them with the view words.

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
} as const;
