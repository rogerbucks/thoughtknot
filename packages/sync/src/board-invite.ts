// Joining a board by invitation (editor spec §45, board_access). The board has a key of its own. An invitation carries
// that key sealed for the one device it is meant for, so only that device can open it. The key is never written down,
// printed or sent in the clear. It is a `VaultKey`, which says only that it is one. Web Crypto.
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
export const newBoardKey = (): Promise<VaultKey> => VaultKey.create();

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
export function join(invitation: Invitation, mine: DeviceKeys): Promise<VaultKey> {
  return VaultKey.openFrom(invitation.sealed, mine, invitation.from);
}
