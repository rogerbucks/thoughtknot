// The names of the ready-made lenses, in UK English (editor spec §42, words_catalogue; editor spec §33, lens_library).
// It holds the reasons the gap lenses give too. source-words.ts keeps these with every other word.

/** The ready-made lenses' names, by key, in UK English. */
export const LENS_SOURCE_WORDS = {
  'lens.ready.everything': 'Everything',
  'lens.ready.decisions': 'Decisions',
  'lens.ready.open-questions': 'Open questions',
  'lens.ready.shaky-claims': 'Shaky claims',
  'lens.ready.risks': 'Risks',
  'lens.gap.unlinked': 'nothing linked',
  'lens.gap.missing': 'no {property}',
  'lens.gap.unusual': '{property} {number} is unusual',
  'lens.gap.stale': 'not touched for months',
  'lens.gap.like': 'like {other}',
} as const;
