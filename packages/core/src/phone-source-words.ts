// What the phone's bottom bar says, in UK English (editor spec ES§40, phone_shell; §42, words_catalogue).
// source-words.ts keeps these with every other word, through app-source-words.ts.

/** The bar's name and its four views, by key, in UK English. */
export const PHONE_SOURCE_WORDS = {
  'phone.tabs': 'Views of this note',
  'phone.board': 'Board',
  'phone.graph': 'Graph',
  'phone.note': 'Note',
  'phone.more': 'More',
} as const;
