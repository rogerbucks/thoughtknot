// Every keyboard shortcut, in one list (editor spec §44, shortcuts_listed). The help shows this list. It names each
// key the drawing and the editor answer, by the place it works. The drawing's own commands are marked. A host offers
// them as its own commands too, so a person can give them keys of their own.

/** Where a shortcut works: on a drawing, while a box is picked up to move, in a table, or in the editor. */
export type ShortcutPlace = 'drawing' | 'moving' | 'table' | 'editor';

/** The places, in the order the list shows them. */
export const SHORTCUT_PLACES: readonly ShortcutPlace[] = ['drawing', 'moving', 'table', 'editor'];

/** One row of the list. Its words are `shortcut.<id>`, what it does, and `shortcut.<id>.keys`, its keys. */
export interface Shortcut {
  id: string;
  place: ShortcutPlace;
  /** The keys it answers, as a key event names them. */
  keys: readonly string[];
  /** Whether a host offers it as a command, which a person can give keys of their own. */
  command?: true;
}

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/** Every keyboard shortcut, in the order the list shows them. */
export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'zoom-in', place: 'drawing', keys: ['+', '='], command: true },
  { id: 'zoom-out', place: 'drawing', keys: ['-'], command: true },
  { id: 'fit', place: 'drawing', keys: ['0'], command: true },
  { id: 'full-screen', place: 'drawing', keys: [], command: true },
  { id: 'leave-full-screen', place: 'drawing', keys: ['Escape'] },
  { id: 'open', place: 'drawing', keys: ['Enter', ' '] },
  { id: 'walk', place: 'drawing', keys: ARROWS },
  { id: 'clear', place: 'drawing', keys: ['Escape'] },
  { id: 'pick-up', place: 'drawing', keys: ['m'] },
  { id: 'centre', place: 'drawing', keys: ['c'] },
  { id: 'outline', place: 'drawing', keys: ['o'] },
  { id: 'menu', place: 'drawing', keys: ['ContextMenu', 'F10'] },
  { id: 'shortcuts', place: 'drawing', keys: ['?'], command: true },
  { id: 'move-choose', place: 'moving', keys: ARROWS },
  { id: 'move-put', place: 'moving', keys: ['Enter'] },
  { id: 'move-back', place: 'moving', keys: ['Escape'] },
  { id: 'table-move', place: 'table', keys: ARROWS },
  { id: 'table-edge', place: 'table', keys: ['Home', 'End'] },
  { id: 'table-page', place: 'table', keys: ['PageUp', 'PageDown'] },
  { id: 'table-sort', place: 'table', keys: ['Enter', ' '] },
  { id: 'table-resize', place: 'table', keys: ARROWS },
  { id: 'table-copy', place: 'table', keys: ['c'] },
  { id: 'suggest', place: 'editor', keys: [' '] },
  { id: 'suggest-choose', place: 'editor', keys: ['ArrowUp', 'ArrowDown'] },
  { id: 'suggest-take', place: 'editor', keys: ['Enter', 'Tab'] },
  { id: 'suggest-close', place: 'editor', keys: ['Escape'] },
  { id: 'undo', place: 'editor', keys: ['z'] },
  { id: 'redo', place: 'editor', keys: ['z', 'y'] },
];
