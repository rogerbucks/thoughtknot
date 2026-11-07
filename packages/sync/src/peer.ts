// Sync between two of an owner's devices over a mesh VPN (editor spec §40, mesh_vpn_sync). Roger, 28 Oct 2026. The
// VPN gives each device an address the others reach, directly or through a relay. ThoughtKnot needs nothing of it but
// a channel that carries bytes. So Tailscale, Headscale, NetBird, Nebula and plain WireGuard all serve.
// - Only the owner's devices. Each device says its public key first. A device whose key is not on the trusted list is
//   sent nothing more, and the channel is closed.
// - End to end. Each device sends a fresh salt and a one-time key with its key. Every message after that is sealed by a key made for this
//   session alone, from the key the two share, a one-time agreement thrown away after, and both salts, and bound to its direction and its place in the order.
//   Their private keys never leave them. A relay, or the VPN itself, carries ciphertext only, and a message recorded,
//   repeated, reflected, dropped or reordered does not open.
// - Sealed twice. What is sent is what each store keeps: records already sealed by the vault key, under hidden names.
// - Each device then sends the records the other lacks, file by file, and stops when both have said they are done.
import { Session, EPHEMERAL_BYTES, SALT_BYTES } from './session.ts';
import type { DeviceKeys } from './keys.ts';
import type { Shelf } from './store.ts';

/** The mesh VPNs sync runs over: any that carries bytes between the owner's devices serves. */
export const MESH_VPNS = ['Tailscale', 'Headscale', 'NetBird', 'Nebula', 'WireGuard'] as const;

/** A channel between two devices, as the host opens it over the mesh VPN: whole messages, in order. */
export interface Channel {
  send(message: Uint8Array): void;
  /** Calls `heard` with each message the other device sends, and `closed` once the channel closes. */
  listen(heard: (message: Uint8Array) => void, closed: () => void): void;
  close(): void;
}

/** What one sync gave: how many records came in, or that the other device is not the owner's. */
export type Synced = { got: number } | { refused: string };

/** One message after the keys: what a device holds, the records the other lacks, or that it has sent all. */
type Said = { held: [string, [string, number][]][] } | { records: [string, string, string[]] } | { done: true };

/** Bytes of a P-256 public key, as sent. */
const KEY_BYTES = 65;
const b64 = (b: Uint8Array): string => btoa(Array.from(b, (x) => String.fromCharCode(x)).join(''));
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** One device's side of sync with another of the owner's devices. */
export class Peer {
  readonly #keys: DeviceKeys;
  readonly #shelf: Shelf;
  readonly #trusted: readonly Uint8Array[];
  /** A peer for the device with `keys`, holding `shelf`, that syncs only with the devices whose keys are `trusted`. */
  constructor(keys: DeviceKeys, shelf: Shelf, trusted: readonly Uint8Array[]) {
    this.#keys = keys;
    this.#shelf = shelf;
    this.#trusted = trusted;
  }

  /** Syncs over `channel`: each device gets what the other holds that it lacks. */
  sync(channel: Channel): Promise<Synced> {
    return new Promise((resolve, reject) => {
      let session: Session | undefined;
      const begun = Session.begin();
      let got = 0,
        theirsDone = false,
        mineDone = false;
      let queue = Promise.resolve();
      const say = async (said: Said) => {
        if (session) channel.send(await session.seal(new TextEncoder().encode(JSON.stringify(said))));
      };
      const finish = () => {
        if (!theirsDone || !mineDone) return;
        channel.close();
        resolve({ got });
      };
      const heard = async (message: Uint8Array) => {
        if (!session) {
          const theirs = message.slice(0, KEY_BYTES);
          const whole = message.length === KEY_BYTES + EPHEMERAL_BYTES + SALT_BYTES;
          if (!whole || same(theirs, this.#keys.publicKey) || !this.#trusted.some((t) => same(t, theirs))) {
            channel.close();
            return resolve({ refused: 'a device that is not one of the owner’s' });
          }
          session = await Session.open(this.#keys, theirs, await begun, message.slice(KEY_BYTES));
          return say({ held: [...(await this.#shelf.held())].map(([note, d]) => [note, [...d]]) });
        }
        let said: Said;
        try {
          said = JSON.parse(new TextDecoder().decode(await session.open(message))) as Said;
        } catch {
          channel.close();
          return resolve({ refused: 'a message did not open: it was changed, repeated, or out of order' });
        }
        if ('held' in said) {
          await this.#sendLacking(new Map(said.held.map(([note, d]) => [note, new Map(d)])), say);
          mineDone = true;
          await say({ done: true });
        } else if ('records' in said) {
          const [note, device, records] = said.records;
          await this.#shelf.copyIn(note, device, records.map(unb64));
          got += records.length;
        } else theirsDone = true;
        finish();
      };
      const closed = () => {
        if (!theirsDone || !mineDone) resolve({ refused: 'the other device closed the channel before sync was done' });
      };
      // each message is taken in turn, after the one before it is done
      channel.listen(
        (m) => {
          queue = queue.then(() => heard(m)).catch(reject);
        },
        () => {
          queue = queue.then(closed);
        },
      );
      void begun.then((b) => {
        channel.send(Uint8Array.from([...this.#keys.publicKey, ...b.hello]));
      });
    });
  }

  /** Sends each record this device holds that `theirs`, what the other holds, lacks. */
  async #sendLacking(theirs: Map<string, Map<string, number>>, say: (s: Said) => Promise<void>): Promise<void> {
    for (const [note, byDevice] of await this.#shelf.held())
      for (const [device, count] of byDevice) {
        const has = theirs.get(note)?.get(device) ?? 0;
        if (count <= has) continue;
        const records = await this.#shelf.recordsOf(note, device, has);
        await say({ records: [note, device, records.map(b64)] });
      }
  }
}
