// The words of the Filter panel's filter by what things hold (editor spec ES§25, untangle_ask_filter), in UK English
// (words_catalogue). They cover asking an AI to fill it, and saving it by name (untangle_filter_saved).
// display-source-words.ts keeps them with the other display words.

/** The words of the filter by what things hold, by key, in UK English. */
export const FILTER_SOURCE_WORDS = {
  'filter.ask.title': 'Filter by what they hold',
  'filter.ask.hint': 'For example: open risks owned by Sam',
  'filter.ask.go': 'Ask AI',
  'filter.ask.show': 'Show these',
  'filter.ask.hide': 'Hide the rest',
  'filter.ask.clear': 'Start again',
  'filter.ask.empty': 'Pick a kind or a test, or ask in words.',
  'filter.ask.no-words': 'Write what you want to see, or how to change the filter.',
  'filter.ask.asking': 'You see what is sent first. Nothing is shown until you press Show these.',
  'filter.ask.filled': 'Filled in from your words.',
  'filter.ask.not-filter': 'That answer was not a filter on things, so nothing was filled in.',
  'filter.ask.by-ai': 'Written by AI: check it.',
  'filter.ask.keeps': { one: 'Keeps {count} of {of}.', other: 'Keeps {count} of {of}.' },
  'filter.ask.things': 'Things',
  'filter.ask.said': '{of} where {tests}',
  'filter.ask.change':
    'The filter now keeps: {now}. Change it as asked and give the whole filter again, or start a new one if asked: {words}',
  'filter.ask.banner': { one: 'Showing {count} thing: {said}', other: 'Showing {count} things: {said}' },
  'filter.ask.edit': 'Change the filter',
  'filter.ask.off': 'Show all',
  'filter.saved.pick': 'Saved filters',
  'filter.saved.picked': 'Filled in from the saved filter {name}.',
  'filter.saved.save': 'Save this filter by name',
  'filter.saved.name': 'Name to save the filter by',
  'filter.saved.keep': 'Save',
  'filter.saved.delete': 'Delete the saved filter picked',
  'filter.saved.done': 'Saved the filter {name} in the note.',
  'filter.saved.removed': 'Deleted the saved filter {name}.',
  'filter.saved.back': 'Put back the saved filter {name}.',
  'filter.saved.changed': 'The note changed after the filter was deleted, so it was not put back.',
} as const;
