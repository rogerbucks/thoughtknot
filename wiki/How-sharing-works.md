# How sharing works

This note shows how notes and boards are shared between devices (ES§40 and ES§45). It draws each system and the
layers it uses. Roger asked for it on 9 November 2026.

## The short answer

| Question | Answer |
|---|---|
| Who can share live? | The desktop app and the web app. Nothing else opens a network connection |
| Why do Obsidian and VS Code stay offline? | Sync for vault files is Obsidian's job. The plug-in has no network code to attack or leak through |
| What travels? | Sealed records only. Each one is locked with the vault key before it leaves the device |
| Where does it travel? | Over the owner's mesh VPN, to private addresses only. The Rust opens the connection, never the page |
| Who runs the note engine in the app? | Rust. The app window may not run WebAssembly, so it asks Rust over eight commands |
| What is the truth? | The note's file. The shared copy follows it, and a write made against an old text is refused |

## The five layers

Every device that shares holds the same five layers. Each layer uses only the one below it.

```gql
(store:Layer {order: 1, name: 'Sealed store', does: 'Keeps each device\'s records, locked with the vault key.'}),
(crdt:Layer {order: 2, name: 'CRDT', does: 'One Automerge text per note. Edits made at the same time merge with nothing lost.'}),
(engine:Layer {order: 3, name: 'Engine', does: 'Checks a change before it replicates.'}),
(projection:Layer {order: 4, name: 'Projection', does: 'Reads the note, with anchors that stay put.'}),
(face:Layer {order: 5, name: 'Editor face', does: 'The one interface every editor uses.'}),
(face)-[:USES]->(projection),
(projection)-[:USES]->(engine),
(engine)-[:USES]->(crdt),
(crdt)-[:USES]->(store)
```

## The four systems

```gql
(obsidian:System {name: 'Obsidian plug-in', live: 'no', how: 'Files only. Obsidian\'s own sync carries them.'}),
(vscode:System {name: 'VS Code tab', live: 'no', how: 'Shows the browser editor page. Never sets a board seat.'}),
(app:System {name: 'Desktop app', live: 'yes', how: 'Note engine in Rust. Mesh link in Rust.'}),
(web:System {name: 'Web app', live: 'yes', how: 'The same stack as the app, with no folder.'}),
(files:Thing {name: 'Note files', does: 'The truth. Every system reads and writes them.'}),
(layer:Thing {name: 'Shared notes layer', does: 'Sits over the files. A write is also kept in the CRDT and sent on.'}),
(rust:Thing {name: 'Rust note engine', does: 'Holds the CRDT for the app. Eight commands, bytes as hex.'}),
(remote:Thing {name: 'Remote CRDT', does: 'The window\'s CRDT. It asks Rust instead of running WebAssembly.'}),
(mesh:Thing {name: 'Mesh link', does: 'Sealed channels to a trusted device. Fresh keys for each session.'}),
(seat:Thing {name: 'Board seat', does: 'A person\'s place at a live board, with a role: view, comment or edit.'}),
(other:Thing {name: 'Other device', does: 'Another trusted device of the owner, or a guest.'}),
(obsidian)-[:READS_WRITES]->(files),
(vscode)-[:READS_WRITES]->(files),
(app)-[:READS_WRITES]->(files),
(web)-[:READS_WRITES]->(files),
(app)-[:USES]->(layer),
(web)-[:USES]->(layer),
(layer)-[:KEEPS_IN]->(remote),
(remote)-[:ASKS]->(rust),
(layer)-[:SENDS_OVER]->(mesh),
(mesh)-[:REACHES]->(other),
(layer)-[:SEATS]->(seat),
(seat)-[:SENDS_OVER]->(mesh)
```

## What keeps it safe

- **Fresh keys for each session.** Two devices agree a new key every time they connect. A recorded session cannot be
  opened later.
- **Trust is explicit.** A device is sent nothing until the owner has pasted its public key.
- **The window stays closed.** Its connect policy allows no network and no WebAssembly. A test fails if that changes.
- **Roles are checked first.** A change is checked against the person's role before it is written.
- **A clash is seen.** A write made against an older text is refused with the note as it now is. Nothing picks a side
  silently.

## Where it is built

| Part | Where |
|---|---|
| The five layers | `packages/sync/src` |
| Sync without WebAssembly | `packages/sync/src/remote.ts` |
| The Rust note engine | `packages/app/src-tauri/src/crdt.rs` |
| The mesh in Rust | `packages/app/src-tauri/src/mesh.rs` |
| The window's wiring | `packages/app/src/app-shared.ts` |
| The Share screens | `packages/app/src/app-share.ts` |

The design for the Rust move is in `design/rust-sync-engine.md` in the project files.
