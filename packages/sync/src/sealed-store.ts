// The encrypted store (editor spec §40, local_encrypted_store, encrypted_everywhere). It wraps any store: each record
// is sealed by the vault key before it is kept, and each note's and device's name is hidden. So what is kept on a
// device, and what Syncthing carries between devices, is ciphertext only, and upstream Automerge is never forked.
import type { VaultKey } from './keys.ts';
import type { Store } from './store.ts';

/** `inner`, with every record sealed by `key` and every name hidden by it. */
export class SealedStore implements Store {
  readonly #inner: Store;
  readonly #key: VaultKey;
  constructor(inner: Store, key: VaultKey) {
    this.#inner = inner;
    this.#key = key;
  }

  async add(note: string, device: string, record: Uint8Array): Promise<void> {
    await this.#inner.add(await this.#key.hide(note), await this.#key.hide(device), await this.#key.seal(record));
  }

  async records(note: string): Promise<Uint8Array[]> {
    const sealed = await this.#inner.records(await this.#key.hide(note));
    return Promise.all(sealed.map((r) => this.#key.open(r)));
  }
}
