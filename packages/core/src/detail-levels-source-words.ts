// What the levels of detail are called, and the badge that says which shows, in UK English (editor spec §68,
// detail_levels; §42, words_catalogue). source-words.ts keeps these with every other word, through views-source-words.ts.

/** The levels' names and badge, by key, in UK English. */
export const DETAIL_LEVELS_SOURCE_WORDS = {
  'levels.subjects': 'Subjects',
  'levels.areas': 'Areas',
  'levels.topics': 'Topics',
  'levels.every-item': 'Every item',
  'levels.loose-ends': 'Loose ends',
  'levels.badge': 'Level {at} of {count} · {name}',
  'levels.gate': 'to {name} · {count}',
  'levels.open': 'Click or tap again to open',
  'levels.back': 'Back',
  'levels.back-label': 'Back to the level you were at',
  'levels.legend-label': 'Subjects: point at one to spotlight it, click to keep it',
  'levels.colour-label': 'Next colour for {name}',
} as const;
