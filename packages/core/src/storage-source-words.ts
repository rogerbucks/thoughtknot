// The words of where graphs are kept (editor spec §55, ST1), in UK English. They are the settings page's rows for the
// place and for keeping who changed what. host-source-words.ts keeps these with the host's own.

/** The words of where graphs are kept, by key, in UK English. */
export const STORAGE_SOURCE_WORDS = {
  'storage.heading': 'Where your graphs are kept',
  'storage.place': 'This vault',
  'storage.place.sentence':
    'Your graphs are notes in this vault, kept where Obsidian keeps them. Moving or syncing them between devices is up to Obsidian and the sync you use.',
  'storage.history': 'Keep who changed what',
  'storage.history.sentence':
    'Off unless you turn it on. When on, each change ThoughtKnot makes to a note is kept as notes in the folder below, with your name on decisions.',
  'storage.history.off': 'Off',
  'storage.history.on': 'Keep them as notes',
  'storage.history.folder': 'Folder for who changed what',
  'storage.history.folder.sentence':
    'The vault folder the changes are kept in, one note a day. Left empty, it is “{folder}”.',
} as const;
