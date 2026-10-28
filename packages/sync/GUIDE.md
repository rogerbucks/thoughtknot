# Sync: where things live

Sync between an owner's devices, with no server deciding what is true (editor spec §40). Roger chose its shape on 28 Oct
2026: each note is one upstream Automerge text, with anchors (Q-11, option C). All five layers stay (Q-12, option B).
The text stays the one truth. Syncthing copies the files between devices, and a mesh VPN carries them.

It is written in erasable TypeScript, so Node runs its tests with no build. It uses Web Crypto, so it runs in every host.
Only the folder store needs Node's files: a phone's host gives a store of its own.

## The five layers, bottom first

Each layer holds only the one below it. `test/five-layers.test.js` checks that, so a layer can be swapped on its own.

1. **The store.** `store.ts` is the interface, and the store held in memory. `folder-store.ts` keeps records in a folder
   that Syncthing shares. `sealed-store.ts` seals every record and hides every name by the vault key, over any store.
   - Each device adds only to its own file of each note. So no two devices write one file, and Syncthing never makes a
     conflict copy.
2. **The CRDT.** `crdt.ts` keeps each note as one Automerge text. Every edit is a splice of it, in its author's name.
   - A merge gives the base, ours and theirs, so the engine can join them by meaning.
   - An anchor is an Automerge cursor. It stays on its character through every device's edits.
3. **The engine.** `engine.ts` refuses an edit that would bring in an error, so it never replicates. An error already in
   the note is not the edit's.
   - After a merge it joins the edits by meaning, with the graph library's `afterTextMerge`. A value the text picked is
     never the decision: the dispute is kept as contested claims.
4. **The projection.** `projection.ts` reads the merged text and keeps what it read, frozen. It is read again only
   when the text changes. It writes nothing of its own.
5. **Presentation.** `synced-notes.ts` is the one interface every editor uses: open, edit, follow, anchor and sync.
   - Obsidian, VS Code, the desktop app, the phone and AI authors all use it.
   - An edit made outside the editor becomes one small splice (`spliceBetween`).

`stack.ts` puts the five layers together for one device. `index.ts` is the package's one entry.

## Between devices

Syncthing copies each store's files. Over a mesh VPN, `peer.ts` does the same between two devices that are on.

- Any VPN that carries bytes serves: Tailscale, Headscale, NetBird, Nebula or plain WireGuard (`MESH_VPNS`).
- Each device says its public key first. One not on the trusted list is sent nothing more.
- Every message after that is sealed by the key the two devices share. So a relay carries ciphertext only.
- Each store says what it holds file by file (`Shelf`), and each device sends the records the other lacks.

## Graphs from many places

`connected.ts` keeps a graph drawn from many places (the core's `connectors.ts`) in step between devices.

- Only what people and AI authors write is synced: the notes and the .gql files. Each device rebuilds the rest.
- An edit to a thing goes home to each note or .gql file it was read from, as one bundle that one undo takes back.
- An edit to a thing from a place ThoughtKnot does not write is an overlay in the note, in the graph
  `<graph>_overlay`. It cites the place and its version.
- When the place moves under an overlay, the two values are contested. When its thing is gone, the overlay is an
  orphan.

## The keys

`keys.ts` holds the vault key and each device's key pair.

- The vault key is made on a device. It reaches another device only sealed for that device's own key pair.
- A device's private key is made so it cannot be exported.
- A key says only that it is a key, in a log, in JSON or in an export.

## The tests

- `test/crdt-transport.test.js` — devices and an AI author edit at once; the edits merge, and a clash of meaning is
  contested.
- `test/local-encrypted-store.test.js` — devices apart then together agree, and what is on disk is sealed.
- `test/five-layers.test.js` — the engine refuses a bad edit before it replicates; a store is swapped with no change
  above it.
- `test/encrypted-everywhere.test.js` — no key in any file, log or sealed copy.
- `test/connector-sync.test.js` — a graph from a file, a note and a plug-in's place. It is synced, edited at home
  and by overlay, and drawn the same on every device.
- `test/mesh-vpn.test.js` — two devices sync through a real TCP relay, which sees ciphertext only; a stranger gets
  nothing.
