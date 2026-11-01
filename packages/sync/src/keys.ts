// The keys (editor spec §40, encrypted_everywhere). Roger, 28 Oct 2026. One vault key seals everything an owner's
// devices keep and carry. It is made on a device, and reaches the owner's other devices only sealed for each one's own
// key pair. A device's private key is made so it cannot be exported. The vault key's bytes are held in a private field
// and never written out. A log, JSON or an export of a key says only that it is one. Web Crypto, so it runs anywhere.

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
    const pair = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
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

/** The owner's vault key: it seals each record and hides each name. */
export class VaultKey {
  readonly #bytes: Uint8Array;
  readonly #seal: CryptoKey;
  readonly #name: CryptoKey;
  private constructor(bytes: Uint8Array, seal: CryptoKey, name: CryptoKey) {
    this.#bytes = bytes;
    this.#seal = seal;
    this.#name = name;
  }

  /** A new vault key, made on this device. */
  static create(): Promise<VaultKey> {
    return VaultKey.#from(globalThis.crypto.getRandomValues(new Uint8Array(KEY_BYTES)));
  }

  static async #from(bytes: Uint8Array): Promise<VaultKey> {
    const base = await subtle().importKey('raw', own(bytes), 'HKDF', false, ['deriveKey']);
    const derive = (info: string, alg: AesKeyGenParams | HmacKeyGenParams, use: KeyUsage[]) =>
      subtle().deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: new TextEncoder().encode(info) },
        base,
        alg,
        false,
        use,
      );
    const seal = await derive('thoughtknot seal', { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']);
    const name = await derive('thoughtknot name', { name: 'HMAC', hash: 'SHA-256', length: 256 }, ['sign']);
    return new VaultKey(bytes.slice(), seal, name);
  }

  /** `plain`, sealed: a fresh nonce, then the ciphertext and its tag. */
  async seal(plain: Uint8Array): Promise<Uint8Array> {
    return sealWith(this.#seal, plain);
  }

  /** What `sealed` holds. Throws when it was not sealed by this key, or was changed. */
  async open(sealed: Uint8Array): Promise<Uint8Array> {
    return openWith(this.#seal, sealed);
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
  static async openFrom(sealed: Uint8Array, mine: DeviceKeys, theirs: Uint8Array): Promise<VaultKey> {
    return VaultKey.#from(await openWith(await mine.sharedWith(theirs), sealed));
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

/** `plain` sealed by `key`, AES-GCM, after a fresh nonce. */
export async function sealWith(key: CryptoKey, plain: Uint8Array): Promise<Uint8Array> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const body = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, own(plain)));
  const out = new Uint8Array(IV_BYTES + body.length);
  out.set(iv);
  out.set(body, IV_BYTES);
  return out;
}

/** What `sealed` holds, sealed by `key`. Throws when it was changed or sealed by another key. */
export async function openWith(key: CryptoKey, sealed: Uint8Array): Promise<Uint8Array> {
  const iv = sealed.slice(0, IV_BYTES);
  return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv }, key, own(sealed.slice(IV_BYTES))));
}
