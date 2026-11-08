// A device's actor name for the CRDT. It is apart from the Automerge build, so the app's window, which may not run
// WebAssembly, can name its device without loading it.

/** A device's Automerge actor: the same for the same device name, so its changes always run in one sequence. */
export async function actorOf(device: string): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`thoughtknot device ${device}`),
  );
  return [...new Uint8Array(hash).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
