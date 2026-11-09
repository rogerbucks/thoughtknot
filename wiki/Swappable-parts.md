# Swappable parts

This note maps each part of ThoughtKnot that a person can swap for a system they already have (ES§40 and ES§43). Roger asked
for it on 9 November 2026. It follows the rule to use what is already there instead of building it again.

## The short answer

| Question | Answer |
|---|---|
| What can be swapped? | Where notes are kept, how devices connect, where keys live, the note engine and the cipher |
| How does a part prove it fits? | It passes the one contract for its kind. A part that fails is refused by name |
| Can the cipher be swapped? | Yes. A suite is accepted only if it passes the cipher contract, and that is checked at every start |
| What if nothing is chosen? | Today's parts run, with no change on the wire |
| Is anything switched silently? | Never. A swap is opt-in, shown in words, and the old place is never deleted |

## The parts and their seams

Each part sits behind one interface. A contract holds every build of that interface to the same promises.

```gql
(store:Part {name: 'Record store', seam: 'Store and Shelf', contract: 'storeContract, shelfContract', ships: 'Memory, folder, IndexedDB, sealed', status: 'swappable'}),
(channel:Part {name: 'Link between devices', seam: 'Channel', contract: 'channelContract', ships: 'Tauri mesh over the VPN', status: 'swappable'}),
(keeper:Part {name: 'Key keeping', seam: 'Keeper', contract: 'keeperContract', ships: 'IndexedDB', status: 'swappable'}),
(suite:Part {name: 'Cipher suite', seam: 'CipherSuite', contract: 'suiteContract', ships: 'AES-256-GCM, ECDH, HKDF', status: 'swappable'}),
(crdt:Part {name: 'Note engine', seam: 'Crdt', contract: 'Crdt interface', ships: 'Automerge in JavaScript or Rust', status: 'two builds'}),
(display:Part {name: 'Display host', seam: 'DisplayHost', contract: 'host contract test', ships: 'Obsidian, app, VS Code, web', status: 'swappable'}),
(painter:Part {name: 'Painter', seam: 'MarkPainter', contract: 'painter tests', ships: 'WebGPU, WebGL, Canvas, SVG', status: 'swappable'}),
(files:Part {name: 'Note storage', seam: 'NoteStorage', contract: 'storage contract', ships: 'Files, memory, layers', status: 'swappable'}),
(ai:Part {name: 'AI service', seam: 'AiProvider', contract: 'core gate', ships: 'Claude, Gemini, Grok, ChatGPT, LM Studio', status: 'swappable'}),
(identity:Part {name: 'Who a person is', seam: 'Permissions', contract: 'none yet', ships: 'Roles in core', status: 'fixed'})
```

## How sharing picks its parts

The app starts sharing from one recipe. A recipe names a cipher suite and a transport. The keeper and the shelves are
handed in the same way. A part left out is today's.

```gql
(recipe:Thing {name: 'Recipe', does: 'Names the parts sharing runs on. Any part left out is the shipped one.'}),
(start:Thing {name: 'startShared', does: 'Checks the cipher suite against its contract, then wires the rest.'}),
(vault:Thing {name: 'Vault key', does: 'Seals every record. Made by the chosen suite.'}),
(session:Thing {name: 'Session', does: 'Fresh keys for each device pair. Sealed by the chosen suite.'}),
(link:Thing {name: 'Mesh link', does: 'Dials and listens through the chosen transport.'}),
(recipe)-[:READ_BY]->(start),
(start)-[:CHECKS]->(suite),
(start)-[:MAKES]->(vault),
(start)-[:MAKES]->(link),
(link)-[:OPENS]->(session),
(vault)-[:USES]->(suite),
(session)-[:USES]->(suite),
(link)-[:USES]->(channel),
(vault)-[:KEPT_IN]->(store),
(start)-[:READS]->(keeper)
```

## The guard on the cipher

No byte may travel or rest unencrypted. So a cipher suite is held to a contract that a plaintext suite cannot pass.

| The contract checks | Why |
|---|---|
| The suite is named, and not none, null or plain | A name that says nothing is hidden is refused |
| What is sealed opens to the same bytes | The suite works |
| The sealed bytes do not hold the plain bytes | Something is really hidden |
| Sealing twice gives different bytes | A fresh nonce for each seal |
| Another key, a changed byte, or a cut message is refused | A message cannot be forged or trimmed |
| Other bound data is refused | A message stays in its place in the order |
| The same key bytes give the same key | Two devices can agree on a session key |

## What is still to come

1. An opt-in probe that lists what a machine offers for each part: a synced folder, a keychain, a VPN.
2. Plug-in points named `transport`, `syncstore`, `keeper` and `suite`, so a plug-in can bring a part.
3. A way for an outside identity system to stand in for roles. Today roles are fixed.
