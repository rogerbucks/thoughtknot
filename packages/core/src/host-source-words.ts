// The words of the Obsidian host's own commands and notices, in UK English (editor spec §42, words_catalogue). They
// name the commands and say what each did, or why it did nothing. The settings page's rows for where graphs are kept
// join them (storage-source-words.ts). source-words.ts keeps them with every other word.

import { STORAGE_SOURCE_WORDS } from './storage-source-words.ts';

/** The words of the host's commands and notices, by key, in UK English. */
export const HOST_SOURCE_WORDS = {
  ...STORAGE_SOURCE_WORDS,
  'host.command.convert': 'Convert this note to standard GQL',
  'outside.heading': 'Plug-ins from outside',
  'outside.sentence':
    'Code from outside ThoughtKnot. Put a plug-in file in the folder {folder}, or add one from a link. Each stays off until you turn it on. It runs apart, with no network, but it can add commands, so turn on only plug-ins you trust.',
  'outside.none': 'No plug-in files are in the folder {folder}.',
  'outside.file': 'Runs this plug-in file. If the file changes, it is turned off until you turn it on again.',
  'outside.link': 'Add a plug-in from a link',
  'outside.link.sentence':
    'The address of a plug-in file, starting https://. It is fetched once, checked, and kept in the folder {folder}, off.',
  'outside.link.add': 'Add',
  'outside.added': 'Added {name}. Turn it on in the settings to run it.',
  'outside.not-added': 'Not added: {why}',
  'outside.not-a-link': 'that is not an address starting https://',
  'outside.not-js': 'the address does not end in a file name ending .js',
  'outside.not-on': 'The plug-in {name} was not turned on: {why}',
  'outside.gone': 'its file is no longer in the folder',
  'outside.changed': 'The plug-in {name} changed since you turned it on, so it is off until you turn it on again.',
  'host.command.recover': 'Recover kept drafts into a new note',
  'host.command.ask-ai': 'Ask an AI model to propose changes',
  'host.command.text-to-graph': 'Make a graph of the text with an AI model',
  'host.command.clear-sends': 'Clear the record of sends to AI models',
  'host.command.import': 'Import from a database, workbook, document or board',
  'host.taken':
    'Another plugin already draws gql blocks, so graphs cannot be drawn. Update or turn off the gql-highlight plugin, then reload Obsidian.',
  'host.to-convert': 'to convert it to standard GQL',
  'host.to-ask-ai': 'to ask an AI model about its graph',
  'host.to-keep-ai': 'to keep what your AI found as your own',
  'host.to-text-graph': 'to make a graph of its text',
  'host.to-import': 'to import into it',
  'host.command.boards-canvas': 'Export the boards of this note as JSON Canvas',
  'host.command.boards-excalidraw': 'Export the boards of this note as Excalidraw',
  'host.command.boards-svg': 'Export the boards of this note as SVG pictures',
  'host.command.boards-png': 'Export the boards of this note as PNG pictures',
  'host.command.boards-pdf': 'Export the boards of this note as a PDF',
  'host.command.slides-pdf': 'Export the slides of this note as a PDF',
  'host.slides.none': 'This note holds no slide to export. Draw a frame on a board to make one.',
  'host.boards.failed': 'The boards were not exported: {why}',
  'host.boards.none': 'This note holds no board to export.',
  'host.boards.no-note': 'Open a note first, then export its boards.',
  'host.boards.done': 'Wrote {file}.',
  'host.boards.as.canvas': 'JSON Canvas',
  'host.boards.as.excalidraw': 'Excalidraw',
  'host.boards.as.svg': 'SVG pictures',
  'host.boards.as.png': 'PNG pictures',
  'host.boards.as.pdf': 'One PDF',
  'host.boards.as.slides': 'Slides as one PDF',
  'host.not-converted': 'Not converted: {why}',
  'host.not-converted-meanwhile': 'Not converted: the note changed meanwhile, and {why}',
  'host.already-standard': 'This note is already standard GQL.',
  'host.converted': {
    one: 'Converted {count} departure to standard GQL.',
    other: 'Converted {count} departures to standard GQL.',
  },
  'host.block-not-standard': 'block {number} could not be made standard GQL',
  'host.no-drafts': 'No drafts are kept.',
  'host.drafts-failed': 'The kept drafts could not be written into {path}: {why} They stay kept.',
  'host.drafts-written': {
    one: '{count} kept draft written into {path}.',
    other: '{count} kept drafts written into {path}.',
  },
  'host.sends-cleared': {
    one: 'Cleared the record of {count} send to AI models.',
    other: 'Cleared the record of {count} sends to AI models.',
  },
  'host.note-deleted':
    'The note was deleted while you were typing. What you typed is kept as a draft: the command "{command}" writes it into a note.',
  'host.note-not-open': 'the note is not open',
} as const;
