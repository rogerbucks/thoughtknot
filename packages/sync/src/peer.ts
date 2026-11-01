// Sync between two of an owner's devices over a mesh VPN (editor spec §40, mesh_vpn_sync). Roger, 28 Oct 2026. The
// VPN gives each device an address the others reach, directly or through a relay. ThoughtKnot needs nothing of it but
// a channel that carries bytes. So Tailscale, Headscale, NetBird, Nebula and plain WireGuard all serve.
// - Only the owner's devices. Each device says its public key first. A device whose key is not on the trusted list is
//   sent nothing more, and the channel is closed.
// - End to end. Every message after that is sealed by the key the two devices share, which only they can make. Their
//   private keys never leave them. A relay, or the VPN itself, carries ciphertext only.
// - Sealed twice. What is sent is what each store keeps: records already sealed by the vault key, under hidden names.
// - Each device then sends the records the other lacks, file by file, and stops when both have said they are done.
import { openWith, sealWith } from './keys.ts';
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
      let key: CryptoKey | undefined;
      let got = 0,
        theirsDone = false,
        mineDone = false;
      let queue = Promise.resolve();
      const say = async (said: Said) => {
        if (key) channel.send(await sealWith(key, new TextEncoder().encode(JSON.stringify(said))));
      };
      const finish = () => {
        if (!theirsDone || !mineDone) return;
        channel.close();
        resolve({ got });
      };
      const heard = async (message: Uint8Array) => {
        if (!key) {
          if (!this.#trusted.some((t) => same(t, message))) {
            channel.close();
            return resolve({ refused: 'a device that is not one of the owner’s' });
          }
          key = await this.#keys.sharedWith(message);
          return say({ held: [...(await this.#shelf.held())].map(([note, d]) => [note, [...d]]) });
        }
        const said = JSON.parse(new TextDecoder().decode(await openWith(key, message))) as Said;
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
      channel.send(this.#keys.publicKey);
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
