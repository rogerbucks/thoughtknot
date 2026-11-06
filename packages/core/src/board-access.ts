// Who may do what on a board (editor spec §45, board_access). Rights follow the permission rules of §39: read is to
// view, write is to edit. Commenting and voting sit between the two, for someone who may read and was asked to join in.
// Nothing here opens a note. A host asks first and edits only when the answer is yes. Pure and host-free.
import type { BoardChange } from './board-edit.ts';
import { boardEdit } from './board-edit.ts';
import type { Guarded, Permissions } from './permissions.ts';
import { word } from './words.ts';

/** What a person may do on a board: look, look and join in, or change it. */
export type BoardRole = 'view' | 'comment' | 'edit';

/** The kinds of change someone who comments may make. */
const JOINING_IN: readonly BoardChange['kind'][] = ['comment', 'vote'];

/** The role `person` has on the board `thing` under `permissions`, or null when they may not open it at all. */
export function roleFor(
  permissions: Permissions,
  person: string,
  thing: Guarded,
  commenters: ReadonlySet<string> = new Set(),
): BoardRole | null {
  if (permissions.allows(person, 'write', thing) && permissions.allows(person, 'read', thing)) return 'edit';
  if (!permissions.allows(person, 'read', thing)) return null;
  return commenters.has(person) ? 'comment' : 'view';
}

/** Whether someone in `role` may make `change`. */
export function mayChange(role: BoardRole | null, change: BoardChange): boolean {
  if (role === 'edit') return true;
  return role === 'comment' && JOINING_IN.includes(change.kind);
}

/** Why `role` may not change the board, in words. */
export function accessRefused(role: BoardRole | null): string {
  if (role === 'view') return word('board.access.view');
  return word(role === 'comment' ? 'board.access.comment' : 'board.access.none');
}

/** The block with `change` made, if `role` allows it; else why not, in words. Every refusal leaves the block as it was. */
export function boardEditAs(
  text: string,
  change: BoardChange,
  role: BoardRole | null,
): { text: string } | { refused: string } {
  if (!mayChange(role, change)) return { refused: accessRefused(role) };
  return boardEdit(text, change);
}
