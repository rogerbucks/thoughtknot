// What stops the editor server's process besides an idle period (spec §26, cc_server_stops):
// - its input closing, as it does when the session that started it ends;
// - the process that started it exiting, seen as the parent changing;
// - a stop signal, which is how `/graph stop` ends it.
// It keeps no file to be found by, so nothing is left behind.
import { word } from '@thoughtknot/core';
import { fstatSync } from 'node:fs';
import { Socket } from 'node:net';

/** How often the process checks that the one that started it is still there. */
export const PARENT_CHECK_MS = 1000;

/** The signals that stop the server at once. */
export const STOP_SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP'] as const;

/** Whether the process's input is a pipe or socket its parent holds, whose closing means the session has ended. */
function inputIsHeld(): boolean {
  try {
    const stat = fstatSync(0);
    if (stat.isFIFO() || stat.isSocket()) return true;
  } catch {
    /* no input to stat */
  }
  // Windows' stat does not name a pipe as one; Node's own stream for the input does: a socket that is no terminal
  return process.platform === 'win32' && process.stdin instanceof Socket && !process.stdin.isTTY;
}

/**
 * Whether the process `parent`, that started this one, has gone. On Linux and macOS this process is then handed to
 * another, so its parent changes. Windows hands it to none, so there the parent is asked after by its number.
 */
export function parentGone(parent: number): boolean {
  if (process.ppid !== parent) return true;
  if (process.platform !== 'win32') return false;
  try {
    process.kill(parent, 0);
    return false;
  } catch (e) {
    return (e as { code?: unknown }).code === 'ESRCH';
  }
}

/** Calls `stop` with why when the session ends, the parent exits or a stop signal comes; once. */
export function watchSession(stop: (reason: string) => void, watch: { input: boolean } = { input: true }): void {
  let done = false;
  const once = (reason: string) => {
    if (done) return;
    done = true;
    stop(reason);
  };
  for (const signal of STOP_SIGNALS) process.on(signal, () => once(signal));
  if (watch.input && inputIsHeld()) {
    process.stdin.on('end', () => once(word('server.session-ended')));
    process.stdin.on('error', () => once(word('server.session-ended')));
    process.stdin.resume();
  }
  const parent = process.ppid;
  setInterval(() => {
    if (parentGone(parent)) once(word('server.parent-exited'));
  }, PARENT_CHECK_MS).unref();
}
