// Joining a board by invitation (editor spec §45, board_access). The board has a key of its own. An invitation carries
// that key sealed for the one device it is meant for, so only that device can open it. The key is never written down,
// printed or sent in the clear. It is a `VaultKey`, which says only that it is one. Web Crypto.
import type { CipherSuite } from './suite.ts';
import { DeviceKeys, VaultKey } from './keys.ts';

/** What a person is invited to do. It is a claim: the host honours it only as far as the permissions agree. */
export type InvitedAs = 'view' | 'comment' | 'edit';

/** An invitation: which board, as whom, from which device, and the board key sealed for the invited device alone. */
export interface Invitation {
  board: string;
  as: InvitedAs;
  from: Uint8Array;
  sealed: Uint8Array;
}

/** A new key for a board, made on this device. */
export const newBoardKey = (suite?: CipherSuite): Promise<VaultKey> => VaultKey.create(suite);

/** An invitation to `board` as `as`, from `mine`, for the device whose public half is `theirs`. */
export async function invite(
  boardKey: VaultKey,
  board: string,
  as: InvitedAs,
  mine: DeviceKeys,
  theirs: Uint8Array,
): Promise<Invitation> {
  return { board, as, from: mine.publicKey, sealed: await boardKey.sealFor(mine, theirs) };
}

/** The board key an invitation holds, opened by the invited device. Throws on any other device, or a changed invitation. */
export function join(invitation: Invitation, mine: DeviceKeys, suite?: CipherSuite): Promise<VaultKey> {
  return VaultKey.openFrom(invitation.sealed, mine, invitation.from, suite);
}

const PREFIX = 'thoughtknot-invitation:';
const b64 = (b: Uint8Array): string => btoa(Array.from(b, (x) => String.fromCharCode(x)).join(''));
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const AS: readonly string[] = ['view', 'comment', 'edit'];

/** An invitation as text to send by any means: it holds the board key only sealed for the one invited device. */
export function invitationText(i: Invitation): string {
  const json = JSON.stringify({ board: i.board, as: i.as, from: b64(i.from), sealed: b64(i.sealed) });
  return PREFIX + b64(new TextEncoder().encode(json));
}

/** The invitation `text` holds; null when it is not one, or is cut short or changed in a way that shows. */
export function invitationFrom(text: string): Invitation | null {
  try {
    const t = text.trim();
    if (!t.startsWith(PREFIX)) return null;
    const said: unknown = JSON.parse(new TextDecoder().decode(unb64(t.slice(PREFIX.length))));
    if (typeof said !== 'object' || said === null) return null;
    const { board, as, from, sealed } = said as Record<string, unknown>;
    if (typeof board !== 'string' || typeof as !== 'string' || !AS.includes(as)) return null;
    if (typeof from !== 'string' || typeof sealed !== 'string') return null;
    return { board, as: as as InvitedAs, from: unb64(from), sealed: unb64(sealed) };
  } catch {
    return null;
  }
}
