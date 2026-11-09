// The cipher suite (editor spec ES§40, encrypted_everywhere). Roger, 9 Nov 2026: every part is swappable, the cipher
// included. So the part that seals and opens bytes is one interface, and a suite is accepted only when it passes the
// suite contract (contracts.ts). The contract refuses a suite that sends plaintext, that opens what was changed, or
// that reuses a nonce. It is run at every start, so a broken suite cannot run quietly. The default suite is AES-GCM.
import { suiteContract } from './contracts.ts';
import { openWith, sealWith } from './keys.ts';

/** What seals and opens bytes with a key. A key is opaque: only the suite that made it can use it. */
export interface CipherSuite<K = unknown> {
  /** The suite's name, such as `aes-256-gcm`. It is never `none`, `null` or `plain`. */
  readonly id: string;
  /** A new random key. */
  newKey(): Promise<K>;
  /** `plain` sealed by `key`. `bound` is checked on opening and is not sent. */
  seal(key: K, plain: Uint8Array, bound?: Uint8Array): Promise<Uint8Array>;
  /** What `sealed` holds. Throws when it was changed, sealed by another key or bound to other data. */
  open(key: K, sealed: Uint8Array, bound?: Uint8Array): Promise<Uint8Array>;
}

/** The suite shipped: AES-256-GCM with a fresh nonce for each seal. */
export const defaultSuite: CipherSuite<CryptoKey> = {
  id: 'aes-256-gcm',
  newKey: () =>
    globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]) as Promise<CryptoKey>,
  seal: sealWith,
  open: openWith,
};

/** Why `suite` is refused, one line for each check it fails; none when it is accepted. */
export async function suiteProblems<K>(suite: CipherSuite<K>): Promise<string[]> {
  const problems: string[] = [];
  for (const check of suiteContract(() => suite)) {
    try {
      await check.run();
    } catch (e) {
      problems.push(`${check.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return problems;
}

/** `suite`, once it has passed the contract; it throws with the reasons when it has not. Call it at every start. */
export async function acceptedSuite<K>(suite: CipherSuite<K>): Promise<CipherSuite<K>> {
  const problems = await suiteProblems(suite);
  if (problems.length) throw new Error(`The cipher suite "${suite.id}" is refused: ${problems.join('; ')}`);
  return suite;
}
