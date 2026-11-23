// A file's real path, asked of a host that can only start a process (spec §26). The mod's file calls read and test for
// a file, but do not settle links. So to know where a matrix note really is, the mod starts the shipped process
// (bin/real-path.mjs, run by node).
// - The start has no shell.
// - The path is one argument, after `--`, so a path starting with a dash is never an option.
// - Only stdout is read. A process that does not answer in time is killed.
// - It runs from the folder it is given, the mod's own, never the session's. A session's folder may be deleted, and
//   then it could not start there. Every path it is asked about is already a full path.
// - Any error is a rejection. The caller takes it as not knowing, and refuses what it cannot place.
// A path that is not there is a rejection with `code` `ENOENT` (the process's exit code 2). So a caller can tell it
// from a failure.
import type { EditorPorts } from './editor-launch.ts';

/** How long the process has to answer before it is killed. */
export const REAL_PATH_TIMEOUT_MS = 5000;

/** What the process printed and the code it exited with; rejects when it cannot be run or does not answer in time. */
async function ask(
  spawn: EditorPorts['spawn'],
  argv: readonly string[],
  after: EditorPorts['after'],
  cwd: string | undefined,
): Promise<{ out: string; code: number | null }> {
  const pieces = spawn(cwd === undefined ? { argv } : { argv, cwd })[Symbol.asyncIterator]();
  let fail: (why: Error) => void = () => {};
  const timedOut = new Promise<never>((_, reject) => (fail = reject));
  timedOut.catch(() => {});
  const timer = after(REAL_PATH_TIMEOUT_MS, () => {
    fail(new Error('The process did not answer in time.'));
    void pieces.return?.();
  });
  const answered = (async () => {
    let out = '';
    for (;;) {
      const next = await pieces.next();
      if (next.done) return { out, code: next.value.code };
      if (next.value.stream === 'stdout') out += next.value.text;
    }
  })();
  answered.catch(() => {});
  try {
    return await Promise.race([answered, timedOut]);
  } finally {
    timer.cancel();
  }
}

/**
 * `realPath` over the host's process call, the command that runs the shipped process and the clock. It runs from
 * `cwd`; with none, from the host's default, the session's folder.
 */
export function realPathVia(
  spawn: EditorPorts['spawn'],
  program: readonly string[],
  after: EditorPorts['after'],
  cwd?: string,
): (path: string) => Promise<string> {
  return async (path) => {
    const { out, code } = await ask(spawn, [...program, '--', path], after, cwd);
    if (code === 2) throw Object.assign(new Error('The path is not there.'), { code: 'ENOENT' });
    if (code !== 0 || !out) throw new Error('The real path could not be found.');
    return out;
  };
}

/**
 * Where the link at a path leads, as a full path. The process settles a relative one from the link's own folder. It is
 * null when the path is no link or is not there. A process that cannot run or fails is a rejection. It runs from `cwd`,
 * as `realPathVia` does.
 */
export function readLinkVia(
  spawn: EditorPorts['spawn'],
  program: readonly string[],
  after: EditorPorts['after'],
  cwd?: string,
): (path: string) => Promise<string | null> {
  return async (path) => {
    const { out, code } = await ask(spawn, [...program, '--link', '--', path], after, cwd);
    if (code === 3) return null;
    if (code !== 0 || !out) throw new Error('The link could not be read.');
    return out;
  };
}

/**
 * How many hard links a file has, links settled: a file with more than one may be a note under another name (ES§26).
 * A process that cannot run, fails or gives no whole number is a rejection. It runs from `cwd`, as `realPathVia` does.
 */
export function linkCountVia(
  spawn: EditorPorts['spawn'],
  program: readonly string[],
  after: EditorPorts['after'],
  cwd?: string,
): (path: string) => Promise<number> {
  return async (path) => {
    const { out, code } = await ask(spawn, [...program, '--links', '--', path], after, cwd);
    if (code !== 0 || !/^\d+$/.test(out)) throw new Error('The links could not be counted.');
    return Number(out);
  };
}
