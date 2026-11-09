// What this machine has for sharing, as the app's one looking command reports it (editor spec ES§40, five_layer_stack).
// The Rust only looks (src-tauri/src/found.rs): it opens nothing and changes nothing. A failed look offers nothing.
// `invoke` is handed in, so nothing here imports Tauri and the tests hand in their own.
import type { Found } from '@thoughtknot/sync/remote';
import type { Invoke } from './tauri-files.ts';

/** The mesh VPN addresses this machine has, as the offers screen wants them. */
export async function findOnMachine(invoke: Invoke): Promise<Found> {
  try {
    const seen = (await invoke('machine_found')) as [string, string][];
    return { vpns: seen.map(([name, address]) => ({ name, address })) };
  } catch {
    return {};
  }
}
