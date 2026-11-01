// What stops the editor server's process besides an idle period (spec §26, cc_server_stops):
// - its input closing, as it does when the session that started it ends;
// - the process that started it exiting, seen as the parent changing, or on Windows its number gone or reused;
// - a stop signal, which is how `/graph stop` ends it.
// It keeps no file to be found by, so nothing is left behind.
import { word } from '@thoughtknot/core';
import { execFile } from 'node:child_process';
import { fstatSync } from 'node:fs';

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
  return process.platform === 'win32' && process.stdin.constructor.name === 'Socket' && !process.stdin.isTTY;
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

/**
 * Whether the process now holding the parent's number started after this one, from its start time as PowerShell
 * says it. Windows soon gives a gone process's number to a new one. Only a newer process can hold it then.
 */
export function numberReused(started: string, since: number = performance.timeOrigin): boolean {
  const at = Date.parse(started.trim());
  return Number.isFinite(at) && at > since;
}

/** The PowerShell line that says the parent's start time, then waits for it to exit; `gone` when it has. */
export function parentWaitLine(parent: number): string {
  const p = `[System.Diagnostics.Process]::GetProcessById(${parent})`;
  return `try { $p = ${p} } catch { 'gone'; exit }; $p.StartTime.ToUniversalTime().ToString('o'); $p.WaitForExit(); 'gone'`;
}

/**
 * Has one PowerShell, on Windows, hold the parent and wait for it to exit. While it is held, Windows gives its number
 * to no other process. A slow PowerShell start is no matter: a number reused before then shows a newer start time.
 */
function awaitParent(parent: number, gone: () => void): void {
  const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', parentWaitLine(parent)], {
    windowsHide: true,
  });
  let said = '';
  child.stdout?.on('data', (d) => {
    said += d;
    const first = (said.split('\n')[0] ?? '').trim();
    if (first === 'gone' || (said.includes('\n') && numberReused(first))) gone();
  });
  child.on('error', () => {}); // no PowerShell: the check by number still runs
  child.unref();
  for (const s of [child.stdin, child.stdout, child.stderr]) (s as { unref?: () => void } | null)?.unref?.();
  process.on('exit', () => child.kill());
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
  if (process.platform === 'win32') awaitParent(parent, () => once(word('server.parent-exited')));
}
