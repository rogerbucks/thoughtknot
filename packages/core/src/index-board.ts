// The names the core's entry exports for the whiteboard (editor spec §45). A host that keeps a board in a synced note
// needs them. They give one change to a board, who may make it, and the note with it made. Kept apart from index.ts so
// each file stays short.
export { boardEditInNote } from './board-edit.ts';
export type { BoardChange } from './board-edit.ts';
export { accessRefused, mayChange } from './board-access.ts';
export type { BoardRole } from './board-access.ts';
