// The keys (editor spec §40, encrypted_everywhere). Roger, 28 Oct 2026. One vault key seals everything an owner's
// devices keep and carry. It is made on a device, and reaches the owner's other devices only sealed for each one's own
// key pair. A device's private key is made so it cannot be exported. The vault key's bytes are held in a private field
// and never written out. A log, JSON or an export of a key says only that it is one. Web Crypto, so it runs anywhere.

import type { CipherSuite } from './suite.ts';

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const IV_BYTES = 12;
const KEY_BYTES = 32;
/** What a key says of itself, wherever it is printed. */
const SAID = '[ThoughtKnot key: never shown]';
/** How Node asks a value what it says of itself in a log. */
const INSPECT = Symbol.for('nodejs.util.inspect.custom');
/** `b` in a buffer of its own, as Web Crypto takes it. */
const own = (b: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(b);

/** One device's key pair: its public half is shared when pairing, its private half never leaves it. */
export class DeviceKeys {
  readonly #pair: CryptoKeyPair;
  /** The public half, as raw bytes, to give to the owner's other devices. */
  readonly publicKey: Uint8Array;
  private constructor(pair: CryptoKeyPair, publicKey: Uint8Array) {
    this.#pair = pair;
    this.publicKey = publicKey;
  }

  /** A new key pair for this device. Its private half cannot be exported. */
  static async create(): Promise<DeviceKeys> {
    const pair = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey', 'deriveBits']);
    return new DeviceKeys(pair, new Uint8Array(await subtle().exportKey('raw', pair.publicKey)));
  }

  /** The pair as a host keeps it between runs (in IndexedDB). Its private half is still unexportable. */
  get kept(): CryptoKeyPair {
    return this.#pair;
  }

  /** This device's keys again, from the pair a host kept. */
  static async restore(pair: CryptoKeyPair): Promise<DeviceKeys> {
    return new DeviceKeys(pair, new Uint8Array(await subtle().exportKey('raw', pair.publicKey)));
  }

  /** The key this device shares with the device whose public half is `theirs`: the same on both. */
  async sharedWith(theirs: Uint8Array): Promise<CryptoKey> {
    const pub = await subtle().importKey('raw', own(theirs), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    return subtle().deriveKey(
      { name: 'ECDH', public: pub },
      this.#pair.privateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  /**
   * The key for one session with the device whose public half is `theirs`. It comes from the key the two devices share,
   * from `fresh` and from `salt`. The `fresh` bytes are what the two sides agreed on with one-time keys, thrown away
   * after. So a session's messages open in that session alone. A device key stolen later cannot open one recorded
   * before.
   */
  async sessionKey(theirs: Uint8Array, salt: Uint8Array, fresh: Uint8Array): Promise<CryptoKey> {
    return defaultSuite.keyFrom(await this.sessionBytes(theirs, salt, fresh));
  }

  /** The bytes of that session key, for a cipher suite to make its own key from. They never leave the session. */
  async sessionBytes(theirs: Uint8Array, salt: Uint8Array, fresh: Uint8Array): Promise<Uint8Array> {
    const pub = await subtle().importKey('raw', own(theirs), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const bits = await subtle().deriveBits({ name: 'ECDH', public: pub }, this.#pair.privateKey, 256);
    const base = await subtle().importKey('raw', Uint8Array.from([...new Uint8Array(bits), ...fresh]), 'HKDF', false, [
      'deriveBits',
    ]);
    const info = new TextEncoder().encode('thoughtknot mesh session 2');
    return new Uint8Array(
      await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: own(salt), info }, base, 256),
    );
  }

  toJSON(): string {
    return SAID;
  }
  toString(): string {
    return SAID;
  }
  [INSPECT](): string {
    return SAID;
  }
}

/** The owner's vault key: it seals each record and hides each name. Its cipher is the suite it was made with. */
export class VaultKey {
  readonly #bytes: Uint8Array;
  readonly #suite: CipherSuite;
  readonly #seal: unknown;
  readonly #name: CryptoKey;
  private constructor(bytes: Uint8Array, suite: CipherSuite, seal: unknown, name: CryptoKey) {
    this.#bytes = bytes;
    this.#suite = suite;
    this.#seal = seal;
    this.#name = name;
  }

  /** A new vault key, made on this device. */
  static create(suite: CipherSuite = defaultSuite): Promise<VaultKey> {
    return VaultKey.#from(globalThis.crypto.getRandomValues(new Uint8Array(KEY_BYTES)), suite);
  }

  static async #from(bytes: Uint8Array, suite: CipherSuite): Promise<VaultKey> {
    const base = await subtle().importKey('raw', own(bytes), 'HKDF', false, ['deriveBits']);
    const derive = async (info: string) =>
      new Uint8Array(
        await subtle().deriveBits(
          { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: new TextEncoder().encode(info) },
          base,
          256,
        ),
      );
    const seal = await suite.keyFrom(await derive('thoughtknot seal'));
    const name = await subtle().importKey(
      'raw',
      own(await derive('thoughtknot name')),
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign'],
    );
    return new VaultKey(bytes.slice(), suite, seal, name);
  }

  /** `plain`, sealed: a fresh nonce, then the ciphertext and its tag. */
  async seal(plain: Uint8Array): Promise<Uint8Array> {
    return this.#suite.seal(this.#seal, plain);
  }

  /** What `sealed` holds. Throws when it was not sealed by this key, or was changed. */
  async open(sealed: Uint8Array): Promise<Uint8Array> {
    return this.#suite.open(this.#seal, sealed);
  }

  /** `name` hidden: the same for every device holding this key, and saying nothing of the name. */
  async hide(name: string): Promise<string> {
    const mac = await subtle().sign('HMAC', this.#name, new TextEncoder().encode(name));
    return [...new Uint8Array(mac).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /** This key sealed for the device whose public half is `theirs`, by `mine`: only that device can open it. */
  async sealFor(mine: DeviceKeys, theirs: Uint8Array): Promise<Uint8Array> {
    return sealWith(await mine.sharedWith(theirs), this.#bytes);
  }

  /** The vault key `sealed` holds, sealed for `mine` by the device whose public half is `theirs`. */
  static async openFrom(
    sealed: Uint8Array,
    mine: DeviceKeys,
    theirs: Uint8Array,
    suite: CipherSuite = defaultSuite,
  ): Promise<VaultKey> {
    return VaultKey.#from(await openWith(await mine.sharedWith(theirs), sealed), suite);
  }

  toJSON(): string {
    return SAID;
  }
  toString(): string {
    return SAID;
  }
  [INSPECT](): string {
    return SAID;
  }
}

/** `plain` sealed by `key`, AES-GCM, after a fresh nonce. `bound` is checked on opening but is not sent. */
export async function sealWith(key: CryptoKey, plain: Uint8Array, bound?: Uint8Array): Promise<Uint8Array> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const algorithm = { name: 'AES-GCM', iv, ...(bound ? { additionalData: own(bound) } : {}) };
  const body = new Uint8Array(await subtle().encrypt(algorithm, key, own(plain)));
  const out = new Uint8Array(IV_BYTES + body.length);
  out.set(iv);
  out.set(body, IV_BYTES);
  return out;
}

/** What `sealed` holds, sealed by `key` and bound to `bound`. Throws when it was changed or sealed by another key. */
export async function openWith(key: CryptoKey, sealed: Uint8Array, bound?: Uint8Array): Promise<Uint8Array> {
  const iv = sealed.slice(0, IV_BYTES);
  const algorithm = { name: 'AES-GCM', iv, ...(bound ? { additionalData: own(bound) } : {}) };
  return new Uint8Array(await subtle().decrypt(algorithm, key, own(sealed.slice(IV_BYTES))));
}

/** The suite shipped: AES-256-GCM with a fresh nonce for each seal. */
export const defaultSuite: CipherSuite<CryptoKey> = {
  id: 'aes-256-gcm',
  newKey: () => subtle().generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
  keyFrom: (raw) => subtle().importKey('raw', own(raw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']),
  seal: sealWith,
  open: openWith,
};
