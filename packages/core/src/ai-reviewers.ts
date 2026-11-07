// The private and public reviewers (editor spec §19; Roger, 7 Nov 2026, R7). A private reviewer is a model the user
// runs: slower, but what it is sent stays on their own machines. A public reviewer is a cloud model: quicker, but kept
// under its provider's terms.
// - Only a model on this device or the user's own network may be private (ai_private_is_own).
// - A note is reviewed by a private reviewer, unless the vault allows a public one (ai_private_default).
// - A private reviewer gets the note's text without asking each time (ai_private_gets_note).
// - A public one gets names, kinds and links only, until the vault allows note text (ai_public_names_only).
// Ceilings (ai-ceiling.ts) and the record of every send still apply. Host-free and pure.
import { endpointProblem, usable } from './ai-choice.ts';
import type { AiModel } from './ai-model.ts';
import { gqlBlocks } from './blocks.ts';
import { readNote } from './drawing.ts';
import type { AiPublic, ReachSettings } from './settings-reach.ts';
import { word } from './words.ts';

declare const URL: new (input: string) => { hostname: string };

/** What a vault allows a public reviewer, each off until the user turns it on. */
export interface VaultConsent {
  /** A public reviewer may review this vault's notes. */
  publicAllowed: boolean;
  /** A public reviewer may be sent note text, after the user saw what one note would send. */
  noteTextAllowed: boolean;
}

/** No consent: the default for every vault. */
export const NO_CONSENT: VaultConsent = { publicAllowed: false, noteTextAllowed: false };

/** What the vault's setting allows a public reviewer. */
export const consentOf = (s: ReachSettings): VaultConsent => ({
  publicAllowed: s.aiPublic !== 'off',
  noteTextAllowed: s.aiPublic === 'note',
});

/**
 * The names, kinds and links of a note's things, one graph after another: all a public reviewer is sent without
 * consent to note text. No property value, no prose and no note on a thing is in it. `shared` are the vault's schemas.
 */
export function namesSent(note: string, shared: string[] = []): string {
  const { graphs } = readNote(
    gqlBlocks(note).map((b) => b.text),
    undefined,
    shared,
  );
  const lines: string[] = [];
  for (const [name, d] of graphs) {
    lines.push(`graph ${name}`);
    for (const b of d.boxes) lines.push(`  ${b.key}: ${b.kind}${b.text && b.text !== b.key ? ` (${b.text})` : ''}`);
    for (const l of d.links) lines.push(`  ${l.from} -[${l.type}]-> ${l.to}`);
  }
  return lines.join('\n');
}

/**
 * Exactly what one note would send a public reviewer at `level`, shown before the vault allows it. That is its names,
 * kinds and links; or, with note text, the whole note. Nothing when off (ai_public_names_only).
 */
export function publicPreview(note: string, level: AiPublic, shared: string[] = []): string {
  if (level === 'off') return '';
  return level === 'note' ? note : namesSent(note, shared);
}

/** The reviewer a note goes to, and what it is sent: the note's text with its graph, or names, kinds and links only. */
export interface Reviewer {
  model: AiModel;
  reach: 'private' | 'public';
  sends: 'note' | 'names';
  /** Whether the user must see and confirm each send first (seen_before_sent): for a public reviewer only. */
  confirm: boolean;
}

// a host on this device, a private network range, or a name only the user's own network answers
const OWN_HOSTS = [
  /^localhost$/,
  /^127(?:\.\d{1,3}){3}$/,
  /^\[::1\]$/,
  /^10(?:\.\d{1,3}){3}$/,
  /^192\.168(?:\.\d{1,3}){2}$/,
  /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/,
  // the shared range Tailscale gives each machine, 100.64.0.0/10
  /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])(?:\.\d{1,3}){2}$/,
  // IPv6 unique local addresses, fc00::/7
  /^\[f[cd][0-9a-f]{0,2}:[0-9a-f:]*\]$/i,
  /^(?:[a-z0-9-]+\.)+ts\.net$/i,
  /^(?:[a-z0-9-]+\.)*[a-z0-9-]+\.local$/i,
];

/** Why `endpoint` cannot be a private reviewer, or null when it can: an address it may use, on the user's own network. */
export function privateProblem(endpoint: string): string | null {
  const bad = endpointProblem(endpoint);
  if (bad) return bad;
  const host = new URL(endpoint.trim()).hostname;
  return OWN_HOSTS.some((r) => r.test(host)) ? null : word('ai.reviewer.not-own', { host });
}

/** Whether a model is a private reviewer: marked so, and at an address on the user's own network. */
export const isPrivate = (m: AiModel): boolean => m.reach === 'private' && privateProblem(m.endpoint) === null;

/**
 * The reviewer a note goes to, or why none may be asked. A private reviewer comes first, and is sent the note. A public
 * one only when the vault allows it, sent the note only when the vault allows that too. Never a public one by itself.
 */
export function reviewerFor(models: AiModel[], consent: VaultConsent = NO_CONSENT): Reviewer | { none: string } {
  const ready = models.filter(usable);
  const own = ready.find(isPrivate);
  if (own) return { model: own, reach: 'private', sends: 'note', confirm: false };
  const cloud = consent.publicAllowed ? ready.find((m) => !isPrivate(m)) : undefined;
  if (cloud) return { model: cloud, reach: 'public', sends: consent.noteTextAllowed ? 'note' : 'names', confirm: true };
  return { none: word('ai.reviewer.none-private') };
}
