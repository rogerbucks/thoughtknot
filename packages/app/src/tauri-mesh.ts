// Bytes between the owner's devices, over the app's mesh commands (editor spec §40, mesh_vpn_sync). The Rust listens
// and dials on private addresses only and carries whole messages (src-tauri/src/mesh.rs); the window's connect policy
// stays closed. Each message is sealed by the sync package before it comes here, so nothing here holds a key.
// `invoke` is handed in, so nothing here imports Tauri and the tests hand in their own.
import type { Channel } from '@thoughtknot/sync';
import type { Invoke } from './tauri-files.ts';

/** How long one wait for a message lasts, in milliseconds. */
const WAIT_MS = 300;

/** A connection `id` as a channel: whole messages in order, and `closed` once the other side or the Rust ends it. */
function channelOf(invoke: Invoke, id: number): Channel {
  let ended = false;
  let sending: Promise<unknown> = Promise.resolve();
  return {
    // sends go one after another, in the order they were made
    send: (message) => {
      sending = sending.then(() => invoke('mesh_send', { connection: id, message: [...message] })).catch(() => {});
    },
    listen(heard, closed) {
      void (async () => {
        while (!ended) {
          try {
            const m = (await invoke('mesh_receive', { connection: id, ms: WAIT_MS })) as number[] | null;
            if (m) heard(Uint8Array.from(m));
          } catch {
            break;
          }
        }
        ended = true;
        closed();
      })();
    },
    close() {
      ended = true;
      void sending.then(() => invoke('mesh_close', { id })).catch(() => {});
    },
  };
}

/** A channel to the device at the private address `address`. Rejects when the address is not a private one. */
export async function dialDevice(invoke: Invoke, address: string, secs = 10): Promise<Channel> {
  return channelOf(invoke, (await invoke('mesh_dial', { address, secs })) as number);
}

/** This device listening at the private address `address`: the address it holds, and the next device to reach it. */
export async function listenForDevice(
  invoke: Invoke,
  address: string,
): Promise<{ address: string; next(): Promise<Channel>; stop(): Promise<void> }> {
  const [listener, held] = (await invoke('mesh_listen', { address })) as [number, string];
  return {
    address: held,
    next: async () => channelOf(invoke, (await invoke('mesh_accept', { listener })) as number),
    stop: async () => void (await invoke('mesh_close', { id: listener })),
  };
}
