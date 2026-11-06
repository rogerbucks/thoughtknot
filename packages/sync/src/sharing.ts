// Starting a shared vault (editor spec §45, board_access; §40, encrypted_everywhere). A device makes its own key pair
// and a vault key, and says which other devices it trusts. The private half of the pair cannot be exported, and the
// vault key is kept only sealed for this device itself. So what is kept between runs opens on this device alone, and
// the one thing shown or shared is the public half. Web Crypto, so it runs in every host.
import { DeviceKeys, VaultKey } from './keys.ts';

/** What a host keeps between runs: the key pair's handle, the vault key sealed for this device, and who is trusted. */
export interface Kept {
  pair: CryptoKeyPair;
  sealed: Uint8Array;
  trusted: string[];
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

/** One device's side of a shared vault. */
export class Sharing {
  readonly #keys: DeviceKeys;
  readonly #vault: VaultKey;
  readonly #sealed: Uint8Array;
  readonly #trusted: Set<string>;
  readonly #keeper: Keeper;
  private constructor(keys: DeviceKeys, vault: VaultKey, sealed: Uint8Array, trusted: string[], keeper: Keeper) {
    this.#keys = keys;
    this.#vault = vault;
    this.#sealed = sealed;
    this.#trusted = new Set(trusted);
    this.#keeper = keeper;
  }

  /** The vault this device started or was given in an earlier run; null when it has none. */
  static async open(keeper: Keeper): Promise<Sharing | null> {
    const kept = await keeper.load();
    if (!kept) return null;
    const keys = await DeviceKeys.restore(kept.pair);
    const vault = await VaultKey.openFrom(kept.sealed, keys, keys.publicKey);
    return new Sharing(keys, vault, kept.sealed, kept.trusted, keeper);
  }

  /** Starts a shared vault on this device: new keys, made here and kept here. */
  static async start(keeper: Keeper): Promise<Sharing> {
    const keys = await DeviceKeys.create();
    const vault = await VaultKey.create();
    const sealed = await vault.sealFor(keys, keys.publicKey);
    const sharing = new Sharing(keys, vault, sealed, [], keeper);
    await sharing.#save();
    return sharing;
  }

  /** The public half of this device's key, in hexadecimal: the one thing to give to the people invited. */
  get publicKey(): string {
    return toHex(this.#keys.publicKey);
  }

  /** The devices trusted, by public key. */
  get trusted(): string[] {
    return [...this.#trusted];
  }

  /** This device's keys and the vault key, for the invitation and the link between devices. */
  get held(): { keys: DeviceKeys; vault: VaultKey } {
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

  #save(): Promise<void> {
    return this.#keeper.save({ pair: this.#keys.kept, sealed: this.#sealed, trusted: this.trusted });
  }
}
