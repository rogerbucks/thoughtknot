// The words of the desktop app's own pages, in UK English (editor spec §41, standalone_app; §42, words_catalogue).
// The editor inside the app is the browser editor's page, which says its own words. The VS Code extension's own
// messages join them here (vscode-source-words.ts). source-words.ts keeps them with every other word.
import { VSCODE_SOURCE_WORDS } from './vscode-source-words.ts';

/** The words of the desktop app and the VS Code extension, by key, in UK English. */
export const APP_SOURCE_WORDS = {
  'app.no-folder': 'Pick the folder your notes are in. The app reads and writes only inside it.',
  'app.open-folder': 'Open a folder of notes',
  'app.folder-notes': { one: '{folder}: {count} note', other: '{folder}: {count} notes' },
  'app.notes': { one: '{count} note', other: '{count} notes' },
  'app.no-notes': 'This folder has no notes yet. A note is a Markdown file, ending in .md.',
  'app.cannot-read': 'Could not open the folder: {why}',
  'app.back': 'All notes',
  'app.phone-no-notes': 'No notes yet. Make one here, or put Markdown files, ending in .md, in the app’s folder.',
  'app.new-note': 'New note',
  'app.privacy': 'ThoughtKnot keeps no data about you. Its privacy page: {address}',
  // moving the notes to another folder (ES§55, storage_user_choice)
  'app.move': 'Move my notes to another folder',
  'app.move.old-folder': 'the old folder',
  'app.move.copying': 'Copying your notes to {folder} and checking each copy…',
  'app.move.done': {
    one: 'Your note is now in {folder}. The old copy is still in {old}.',
    other: 'Your {count} notes are now in {folder}. The old copies are still in {old}.',
  },
  'app.move.let-go': 'Remove the old copies',
  'app.move.keep': 'Keep them',
  'app.move.removed': { one: 'Removed {count} old copy from {old}.', other: 'Removed {count} old copies from {old}.' },
  'app.move.kept': 'Kept in {old}, as they changed after the move: {paths}',
  'app.move.clash': '{folder} already has other notes at these names: {paths}. Nothing was moved.',
  'app.move.copy': 'These did not read back from {folder} as they were: {paths}. Nothing was moved.',
  'app.move.changed': 'These notes changed while they were copied: {paths}. Nothing was moved, so try again.',
  'app.move.cannot': 'Could not move the notes: {why}',
  'app.not-yet': 'This is not in the app yet. Open the note in Obsidian or the browser editor for it.',
  ...VSCODE_SOURCE_WORDS,
} as const;
