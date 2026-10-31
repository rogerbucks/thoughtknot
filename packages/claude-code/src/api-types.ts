// The editor server's replies and refusals, typed once for the page and the server alike (spec §26; risk API-4).
// The server builds each reply as one of these, and the page reads it as the same. A refusal is always JSON with a
// `why`, whatever its status, so the page can say it in the server's words.
import type { ChangedFile } from '@thoughtknot/core';

/** Every refusal: why nothing was done, in words to show the person. */
export interface Refused {
  why: string;
}

/** What the server gives for a note: its text, its version and any draft kept for it, with the version it was typed against. */
export interface NoteReply {
  text: string;
  version: string;
  draft: { text: string; against: string | null } | string | null;
}

/** Up to date or out of date, by graph, for each graph of a note with a picture for readers (§62). */
export type PictureStates = Record<string, 'current' | 'stale'>;

/** A write made: the note's new version. */
export interface WriteReply {
  version: string;
}

/** A write refused because the note changed since the page read it (409): the note as it is now, and the draft kept. */
export interface StaleWrite extends Refused {
  text: string;
  version: string;
  draft: boolean;
}

/** A write refused for another reason (410, 500): whether what was sent is kept as a draft. */
export interface UnwrittenReply extends Refused {
  draft: boolean;
}

/** One earlier version, as the server lists it. */
export interface PageVersion {
  commit: string;
  kind: 'commit' | 'branch';
  label: string;
}

/** A review item's changed files, as the server sends them, with those the gate withheld. */
export interface PageItemFiles {
  files: ChangedFile[];
  withheld: { path: string; why: string }[];
  workstreams: string | null;
  unread: number;
}

/** A line of the change stream: the note as it is now, or why it is no longer sent. */
export type FollowLine = { version: string; text: string } | { gone: string };

/** The `why` of a refusal's body, or null when the body is not a refusal. */
export function whyOf(body: unknown): string | null {
  const why = (body as Partial<Refused> | null)?.why;
  return typeof why === 'string' ? why : null;
}

/** A refusal's body as the server sends it. */
export const refusalText = (why: string): string => JSON.stringify({ why } satisfies Refused);
