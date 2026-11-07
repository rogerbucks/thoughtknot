// Starting a shared vault (editor spec §45, board_access; ES§40, encrypted_everywhere). A device makes its own key pair
// and a vault key, and says which other devices it trusts. The private half of the pair cannot be exported, and the
// vault key is kept only sealed for this device itself. So what is kept between runs opens on this device alone, and
// the one thing shown or shared is the public half. Web Crypto, so it runs in every host.
import { invitationFrom, invitationText, invite, join } from './board-invite.ts';
import type { Invitation, InvitedAs } from './board-invite.ts';
import { DeviceKeys, VaultKey } from './keys.ts';

/** What a host keeps between runs: the key pair's handle, the vault key sealed for this device, and who is trusted. */
export interface Kept {
  pair: CryptoKeyPair;
  /** The vault key sealed for this device; null on a device that has not started or joined a vault yet. */
  sealed: Uint8Array | null;
  trusted: string[];
  /** What this device was invited to, when it joined someone else's vault. */
  joined?: JoinedTo;
}

/** The invitation a device accepted: which board, as whom, from which device (its public key in hexadecimal). */
export interface JoinedTo {
  board: string;
  as: InvitedAs;
  from: string;
}

/** Where a host keeps `Kept`: IndexedDB in the apps, memory in a test. */
export interface Keeper {
  load(): Promise<Kept | null>;
  save(kept: Kept): Promise<void>;
}

const POINT_BYTES = 65;

/** `bytes` as lower-case hexadecimal. */
export const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** The bytes of hexadecimal `text`, spaces ignored; null when it is not hexadecimal. */
export function fromHex(text: string): Uint8Array | null {
  const hex = text.replace(/\s+/g, '').toLowerCase();
  if (!/^(?:[0-9a-f]{2})+$/.test(hex)) return null;
  return Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
}

/** A short form of a public key to read aloud and compare: four groups of four characters. */
export async function fingerprint(publicKey: Uint8Array): Promise<string> {
  const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(publicKey)));
  return (toHex(hash.slice(0, 8)).match(/..../g) ?? []).join(' ');
}

/** Why an invitation was not taken: it is not one, it was not sealed for this device, or this device has a vault. */
export type NotJoined = 'not-an-invitation' | 'not-for-this-device' | 'has-vault';

/** One device's side of a shared vault. */
export class Sharing {
  #keys: DeviceKeys;
  #vault: VaultKey | null;
  #sealed: Uint8Array | null;
  #joined: JoinedTo | undefined;
  readonly #trusted: Set<string>;
  readonly #keeper: Keeper;
  private constructor(
    keys: DeviceKeys,
    vault: VaultKey | null,
    kept: Pick<Kept, 'sealed' | 'trusted' | 'joined'>,
    k: Keeper,
  ) {
    this.#keys = keys;
    this.#vault = vault;
    this.#sealed = kept.sealed;
    this.#joined = kept.joined;
    this.#trusted = new Set(kept.trusted);
    this.#keeper = k;
  }

  /** This device's sharing as kept in an earlier run; null when it has none. */
  static async open(keeper: Keeper): Promise<Sharing | null> {
    const kept = await keeper.load();
    if (!kept) return null;
    const keys = await DeviceKeys.restore(kept.pair);
    const vault = kept.sealed ? await VaultKey.openFrom(kept.sealed, keys, keys.publicKey) : null;
    return new Sharing(keys, vault, kept, keeper);
  }

  /** Makes this device's keys and nothing more: to be invited into someone else's vault. */
  static async prepare(keeper: Keeper): Promise<Sharing> {
    const sharing = new Sharing(await DeviceKeys.create(), null, { sealed: null, trusted: [] }, keeper);
    await sharing.#save();
    return sharing;
  }

  /** Starts a shared vault on this device: new keys, made here and kept here. */
  static async start(keeper: Keeper): Promise<Sharing> {
    const sharing = await Sharing.prepare(keeper);
    await sharing.#makeVault();
    return sharing;
  }

  /** Whether this device holds a vault key, started here or given by an invitation. */
  get hasVault(): boolean {
    return this.#vault !== null;
  }

  /** What this device was invited to, when it joined someone else's vault. */
  get joined(): JoinedTo | undefined {
    return this.#joined;
  }

  /** The public half of this device's key, in hexadecimal: the one thing to give to the people invited. */
  get publicKey(): string {
    return toHex(this.#keys.publicKey);
  }

  /** The devices trusted, by public key. */
  get trusted(): string[] {
    return [...this.#trusted];
  }

  /** This device's keys and the vault key, for the link between devices. */
  get held(): { keys: DeviceKeys; vault: VaultKey | null } {
    return { keys: this.#keys, vault: this.#vault };
  }

  /** Trusts the device whose public key is `text`. Returns why not when it is not another device's public key. */
  async trust(text: string): Promise<'not-a-key' | 'own-key' | undefined> {
    const bytes = fromHex(text);
    if (!bytes || bytes.length !== POINT_BYTES || bytes[0] !== 4) return 'not-a-key';
    if (toHex(bytes) === this.publicKey) return 'own-key';
    this.#trusted.add(toHex(bytes));
    await this.#save();
    return undefined;
  }

  /** Stops trusting the device whose public key is `key`. */
  async distrust(key: string): Promise<void> {
    this.#trusted.delete(key);
    await this.#save();
  }

  /**
   * An invitation, as text to send by any means, to the trusted device `theirs`. It holds the vault key only sealed
   * for that one device. Undefined when this device has no vault or does not trust that device.
   */
  async invite(board: string, as: InvitedAs, theirs: string): Promise<string | undefined> {
    const bytes = fromHex(theirs);
    if (!this.#vault || !bytes || !this.#trusted.has(toHex(bytes))) return undefined;
    return invitationText(await invite(this.#vault, board, as, this.#keys, bytes));
  }

  /** What the invitation `text` says, to show before it is taken; null when it is not one. */
  static read(text: string): (Invitation & { fromKey: string }) | null {
    const i = invitationFrom(text);
    return i ? { ...i, fromKey: toHex(i.from) } : null;
  }

  /**
   * Takes the invitation `text`: this device then holds the vault key and trusts the device that invited it. The
   * person has read the inviter's fingerprint first, as nothing else says who really sent it.
   */
  async accept(text: string): Promise<NotJoined | undefined> {
    if (this.#vault) return 'has-vault';
    const i = invitationFrom(text);
    if (!i) return 'not-an-invitation';
    let vault: VaultKey;
    try {
      vault = await join(i, this.#keys);
    } catch {
      return 'not-for-this-device';
    }
    this.#vault = vault;
    this.#sealed = await vault.sealFor(this.#keys, this.#keys.publicKey);
    this.#trusted.add(toHex(i.from));
    this.#joined = { board: i.board, as: i.as, from: toHex(i.from) };
    await this.#save();
    return undefined;
  }

  async #makeVault(): Promise<void> {
    this.#vault = await VaultKey.create();
    this.#sealed = await this.#vault.sealFor(this.#keys, this.#keys.publicKey);
    await this.#save();
  }

  #save(): Promise<void> {
    const kept: Kept = { pair: this.#keys.kept, sealed: this.#sealed, trusted: this.trusted };
    if (this.#joined) kept.joined = this.#joined;
    return this.#keeper.save(kept);
  }
}
