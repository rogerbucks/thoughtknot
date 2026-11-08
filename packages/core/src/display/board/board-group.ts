// The G key on a board (editor spec §45, board_cluster): notes that share a tag or a word are put in frames. The plan
// is worked out in the core; this writes its frames one after the other and says what was done.
import type { Board } from '../../board.ts';
import { clusterPlan } from '../../board-cluster.ts';
import type { BoardChange } from '../../board-edit.ts';

/** Groups the board's notes into frames through `write`, then says the result through `say`. */
export async function groupNotes(
  board: Board,
  write: (change: BoardChange) => Promise<void>,
  say: (words: string) => void,
): Promise<void> {
  const plan = clusterPlan(board);
  for (const change of plan.changes) await write(change);
  say(plan.said);
}

/** Whether a key press is the G that groups notes: no other key is held with it. */
export const isGroupKey = (e: KeyboardEvent): boolean => e.key === 'g' && !(e.ctrlKey || e.metaKey || e.altKey);
