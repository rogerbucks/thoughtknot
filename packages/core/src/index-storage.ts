// Where graphs are kept (editor spec §55, ST1): the place chosen, a checked move, and the history of changes as its own
// layer. index-late.ts exports them from the core's entry, so index.ts stays short.
export { letGoOfOld, moveNotes, MOVE_REFUSED, NO_CHOICE, storageInUse, storageOffered } from './storage-choice.ts';
export { storageSettingFrom } from './storage-choice.ts';
export type { ChosenStorage, LetGo, MovedNote, MoveOutcome, MoveRefused, NoPlace } from './storage-choice.ts';
export type { StorageChoice, StorageSetting } from './storage-choice.ts';
export { memoryHistory, moveHistory, notesHistory } from './history-store.ts';
export { historyContract } from './history-contract.ts';
export type { HistoryStore } from './history-store.ts';
export type { HistoryCheck } from './history-contract.ts';
