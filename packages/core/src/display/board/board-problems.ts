// What is wrong in a board's block, listed under the board (editor spec §45, board_view; spec §8).
// A board with a line that cannot be read refuses every edit, so nothing in it is lost. It says to fix the problems
// listed under it. So they are listed there, as a drawing's problems are (problems-list.ts). Each has its line of
// the block, what is wrong and its fix.
import { readBoard } from '../../board.ts';
import { renderProblems } from '../graph-view/problems-list.ts';

/** Lists in `root` what is wrong in the board block `source`. A block with nothing wrong gets no list. */
export function listProblems(root: HTMLElement, source: string): void {
  const problems = readBoard(source).problems.filter((p) => p.severity !== 'hint');
  if (!problems.length) return;
  renderProblems(
    root,
    problems.map((p) => ({ ...p, noteLine: p.line })),
    false,
  );
}
