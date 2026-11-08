// The repo scripts node may run in a command that names `classification`, for gate-shell.ts (spec ES§26, risk
// TRUST-1). A node script cannot be read here, so none is trusted by what it holds. A few are trusted by name, each
// with the arguments that make it write only a new file that is no note. The script's real path must end in its name.
// What the file holds is not checked: a script Claude made could be named so. But such a script could run anyway in a
// command that does not name the word, so the list opens no new way.
//
// Roger's rulings of 7 and 8 Nov 2026 allow a write that only makes a new file. This list is that rule for node.

/** Whether a word is one of `--excuse`'s flags. */
const isFlag = (word: string) => word.startsWith('-');

/**
 * `tests-first.mjs --excuse [--fault] <test file> <test> <reason>`. It writes one JSON file in its own repo's
 * test/seen-failing/, named by a hash of the test. It refuses to write over one kept already. `--force` would replace
 * it, and `--repo` would choose another folder, so neither is allowed.
 */
function excuseOnly(args: readonly string[]): boolean {
  const [mode, ...rest] = args;
  const flags = rest[0] === '--fault' ? 1 : 0;
  const named = rest.slice(flags);
  return mode === '--excuse' && named.length === 3 && named.every((a) => a && !isFlag(a));
}

/** Each script trusted, by the end of its real path, with what its arguments must be. */
const SCRIPTS = new Map<string, (args: readonly string[]) => boolean>([['/scripts/tests-first.mjs', excuseOnly]]);

/** A node that runs its first argument as the script. */
const NODE = /^(\/[\w./-]*\/)?node$/;

/**
 * The script a step's node runs, and the end its real path must have. That is when it runs a trusted script with
 * arguments that only make a new record. Null when it does not. node may be given no option of its own.
 */
function knownNodeScript(command: readonly string[]): { script: string; end: string } | null {
  const [program = '', script = '', ...args] = command;
  if (!NODE.test(program) || isFlag(script)) return null;
  for (const [end, allows] of SCRIPTS) if (`/${script}`.endsWith(end) && allows(args)) return { script, end };
  return null;
}

/**
 * Whether a step's node runs a trusted script that only makes a new record. `paths` gives each full path a word may
 * lead to. The one path the script's word leads to must really end in its listed name, so a link to another file does
 * not count. gate-shell.ts calls it only for a step with no redirection and a heredoc the shell would not expand.
 */
export async function nodeOnlyMakes(
  command: readonly string[],
  paths: (word: string) => string[] | null,
  realPath: (path: string) => Promise<string>,
): Promise<boolean> {
  const known = knownNodeScript(command);
  const [path, ...more] = (known && paths(known.script)) ?? [];
  if (!known || path === undefined || more.length) return false;
  return realPath(path).then(
    (real) => real.endsWith(known.end),
    () => false,
  );
}
