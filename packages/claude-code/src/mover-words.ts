// Which words of a Bash command a move may act on, for data-guard.ts (risk TRUST-2). A move is `mv`, `rm`, `cp`,
// `rsync` or `ln`. The guard refuses a move that takes a folder above the mod's data folder. Judged on the whole
// command, a step that only reads such a folder made a copy elsewhere in the command look like a move of it. So the
// command is read step by step (shell-steps.ts), and only the words a move may be handed are given back. When the
// steps cannot say which those are, the answer is null and the guard judges every word, as it did before.
import { UNKNOWN, shellSteps } from './shell-steps.ts';

/**
 * A command that moves, removes, copies, syncs or links whole folders: `mv`, `rm`, `cp`, `rsync` or `ln` as a command,
 * by its name alone or by a path to it, such as `/bin/rm`.
 */
export const MOVERS = /(^|[\s;|&(`/])(mv|rm|cp|rsync|ln)(?=[\s;|&)`]|$)/;

/** The movers by name. */
const MOVER_NAMES: ReadonlySet<string> = new Set(['mv', 'rm', 'cp', 'rsync', 'ln']);

/**
 * The programs that make the steps after them run somewhere the steps cannot place: in another folder, in a loop or
 * branch, or as text run again. With any of them, the whole command is judged as one.
 */
const PLACE_UNKNOWN: ReadonlySet<string> = new Set([
  '.',
  'case',
  'cd',
  'eval',
  'exec',
  'for',
  'function',
  'if',
  'popd',
  'pushd',
  'select',
  'source',
  'until',
  'while',
]);

/** A word that gives a variable its value: `NAME=value`, standing first or after `export` and the like. */
const ASSIGNMENT = /^[A-Za-z_]\w*=/;

/**
 * The words whose folders a move may take, read step by step: the words of each step that runs a mover, the files it
 * writes, and the value of every variable set, which a mover may be handed. Null when the steps cannot say, so the
 * whole command is judged: the command is unread, a step's place is not known, or a mover is named where it is not
 * the program of its own step (handed to `xargs`, `sudo` or `find -exec`, in `sh -c`, a heredoc or a substitution).
 */
export function moverWords(command: string): string[] | null {
  const steps = shellSteps(command);
  if (steps === null) return null;
  const out: string[] = [];
  for (const step of steps) {
    const first = step.words.findIndex((w) => !ASSIGNMENT.test(w));
    const path = first < 0 ? null : (step.words[first] ?? null);
    const program = path === null ? null : path.slice(path.lastIndexOf('/') + 1);
    if (program !== null && PLACE_UNKNOWN.has(program)) return null;
    const moves = program !== null && MOVER_NAMES.has(program);
    const others = step.words.filter((_w, at) => !(moves && at === first));
    if (others.some((w) => MOVERS.test(w) || w.includes(UNKNOWN))) return null;
    if (step.body !== null && MOVERS.test(step.body)) return null;
    for (const w of step.words) if (ASSIGNMENT.test(w)) out.push(w.slice(w.indexOf('=') + 1));
    if (moves) out.push(...others, ...step.writes.map((write) => write.to));
  }
  return out;
}
