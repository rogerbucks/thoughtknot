// What the View menu says beside an option a view cannot take, in UK English (editor spec §68, view_options_everywhere;
// §42, words_catalogue). The option stays in the menu, greyed, with this line under it. source-words.ts keeps these with
// every other word, through views-source-words.ts.

/** Why an option is greyed in this view, by key, in UK English. */
export const VIEW_SUPPORT_SOURCE_WORDS = {
  'view.not-here.cells':
    'Not in this view: it lines things up in rows and cells, and a lens would bend them out of line. Zoom in instead.',
  'view.not-here.no-links': 'Not in this view: it draws no links to hide, fold or merge.',
  'view.not-here.own-shape': 'Not in this view: its shape is its layout.',
  'view.not-here.fixed-way': 'Not in this view: its shape sets which way it runs.',
  'view.not-here.yet': 'Not in this view yet: still to be built.',
} as const;
