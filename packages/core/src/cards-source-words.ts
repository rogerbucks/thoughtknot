// The words of the card view, in UK English (ES§42, words_catalogue; ES§73, render_cards). They are said on
// each card, the bar over the cards chosen together, their arrangements, and the undo of a card sized, put or pinned.

/** The words of the card view, by key, in UK English. */
export const CARDS_SOURCE_WORDS = {
  'view.cards': 'Cards: show each thing with its whole note',
  'view.cards.more': { one: 'Show all: {count} more line', other: 'Show all: {count} more lines' },
  'view.cards.less': 'Show less',
  'view.cards.title': 'Name only',
  'view.cards.whole': 'Show the card',
  'view.cards.lines': 'First lines',
  'view.cards.full': 'All it holds',
  'view.cards.chosen': '{count} chosen',
  'view.cards.every': 'Choose every card',
  'view.cards.none': 'Clear the choice',
  'view.cards.pin': 'Pin where they are',
  'view.cards.widened': 'Resized {thing}',
  'view.cards.sets': 'Arrangements',
  'view.cards.sets.pick': 'Use a saved arrangement',
  'view.cards.sets.save': 'Save this arrangement',
  'view.cards.sets.name': 'Arrangement name',
  'view.cards.sets.keep': 'Save',
  'view.cards.sets.forget': 'Forget the arrangement picked',
  'view.cards.sets.used': 'Arranged as {name}',
  'view.cards.sets.saved': 'Saved arrangement {name}',
  'view.cards.sets.forgot': 'Forgot arrangement {name}',
  'view.cards.unpin': 'Unpin: back to the layout',
  'view.cards.unpin-all': 'Unpin: back to the layout',
  'view.cards.pinned': { one: 'Pinned {count} card', other: 'Pinned {count} cards' },
  'view.cards.unpinned': {
    one: 'Gave {count} card back to the layout',
    other: 'Gave {count} cards back to the layout',
  },
} as const;
