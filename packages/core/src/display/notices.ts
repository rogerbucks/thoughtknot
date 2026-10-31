// How long a notice stays, and the last few it said (risk NEURO-6). A slow reader must be able to finish a long message,
// and to read it again. So a notice stays longer the longer it is. Past `STICKY_OVER` characters it stays until the
// person dismisses it. The last `KEPT` are kept, to be listed behind the problems badge.

/** The least a notice stays, in milliseconds. */
export const NOTICE_MS = 5000;
/** What each character of a message adds to that, in milliseconds. */
export const NOTICE_MS_PER_CHAR = 40;
/** A message longer than this many characters stays until dismissed. */
export const STICKY_OVER = 80;
/** How many past messages are kept. */
export const KEPT = 10;

/** How long a notice of `message` stays, in milliseconds; 0 means until the person dismisses it. */
export const noticeMs = (message: string): number =>
  message.length > STICKY_OVER ? 0 : NOTICE_MS + message.length * NOTICE_MS_PER_CHAR;

const kept: string[] = [];

/** Keeps `message` as the newest of the messages said. */
export function rememberNotice(message: string): void {
  kept.unshift(message);
  kept.length = Math.min(kept.length, KEPT);
}

/** The last messages said, newest first. */
export const recentNotices = (): string[] => [...kept];
