// One session between two devices (editor spec §40, mesh_vpn_sync; encrypted_everywhere). Both sides make a fresh
// salt and a one-time key pair. The session key comes from the key the devices share, the key the one-time pairs agree
// on, and both salts. The one-time private keys are thrown away at once. So a device key stolen later cannot open a
// session recorded before (forward secrecy). Every message is sealed and bound to its direction and its place in the
// order. So a message recorded earlier, or in another session, does not open. Nor does one sent back the way it came,
// one repeated, one dropped from the middle, or one moved out of order. A relay or a listener on the network can do
// none of these without the session ending. Web Crypto, so it runs in every host.
import { openWith, sealWith } from './keys.ts';
import type { DeviceKeys } from './keys.ts';

/** Bytes of the fresh salt each side makes for a session. */
export const SALT_BYTES = 32;

/** Whether the bytes `a` come before `b`. */
const before = (a: Uint8Array, b: Uint8Array): boolean => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! < b[i]!;
  return a.length < b.length;
};
const join = (a: Uint8Array, b: Uint8Array): Uint8Array => Uint8Array.from([...a, ...b]);

/** What a side sends to begin a session: its one-time public key and salt, and the private half it keeps. */
export interface Begun {
  hello: Uint8Array;
  readonly private: CryptoKey;
}

/** Bytes of a one-time public key. */
export const EPHEMERAL_BYTES = 65;

export class Session {
  readonly #key: CryptoKey;
  /** Whether this device's public key sorts first: the two sides then label their messages differently. */
  readonly #first: boolean;
  #sent = 0;
  #heard = 0;
  private constructor(key: CryptoKey, first: boolean) {
    this.#key = key;
    this.#first = first;
  }

  /** A fresh salt for a session. */
  static salt(): Uint8Array {
    return globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  }

  /** A new one-time key pair and salt: `hello` is what goes to the other device, after the device key. */
  static async begin(): Promise<Begun> {
    const pair = await globalThis.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
      'deriveBits',
    ]);
    const pub = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', pair.publicKey));
    return { hello: join(pub, Session.salt()), private: pair.privateKey };
  }

  /** The session of `keys` with the device whose public half is `theirs`, from what each side began with. */
  static async open(keys: DeviceKeys, theirs: Uint8Array, mine: Begun, theirHello: Uint8Array): Promise<Session> {
    const first = before(keys.publicKey, theirs);
    const mySalt = mine.hello.slice(EPHEMERAL_BYTES);
    const [theirEph, theirSalt] = [theirHello.slice(0, EPHEMERAL_BYTES), theirHello.slice(EPHEMERAL_BYTES)];
    const other = await globalThis.crypto.subtle.importKey(
      'raw',
      new Uint8Array(theirEph),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    );
    const fresh = new Uint8Array(
      await globalThis.crypto.subtle.deriveBits({ name: 'ECDH', public: other }, mine.private, 256),
    );
    const salt = first ? join(mySalt, theirSalt) : join(theirSalt, mySalt);
    return new Session(await keys.sessionKey(theirs, salt, fresh), first);
  }

  /** What each message is bound to: who sent it, as the first or the second key, and its number. */
  static #bound(fromFirst: boolean, n: number): Uint8Array {
    const out = new Uint8Array(9);
    out[0] = fromFirst ? 0 : 1;
    new DataView(out.buffer).setBigUint64(1, BigInt(n));
    return out;
  }

  /** `plain` sealed as the next message this side sends. Call in the order the messages are to be sent. */
  seal(plain: Uint8Array): Promise<Uint8Array> {
    return sealWith(this.#key, plain, Session.#bound(this.#first, this.#sent++));
  }

  /** What the next message from the other side holds. Throws when it is not that message, whole and unchanged, and then waits for it still. */
  async open(sealed: Uint8Array): Promise<Uint8Array> {
    const plain = await openWith(this.#key, sealed, Session.#bound(!this.#first, this.#heard));
    this.#heard++;
    return plain;
  }
}
