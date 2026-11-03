# The Copilot Cowork skill: where things live

A skill for Microsoft Copilot Cowork (editor spec §46, M1). It lets Cowork read, check, draw and edit the graph blocks
of Markdown notes kept in OneDrive or SharePoint. It runs on the same host-free core as every other host.

The skill is a `SKILL.md` and companion files. The same `SKILL.md` loads as a Claude skill, so it names no host.

## What it holds back, and why

- **No server of ours.** No connector, no secret and no network call beyond Microsoft 365. A connector waits for a
  security review.
- **The library does the work.** Every reading, check, layout and edit comes from `@thoughtknot/core`. The prose never
  says what the notation allows, so there is no second copy of its rules to drift.
- **The gate comes first.** A note is held to its classification and the AI ceiling before it is read into the
  conversation. Microsoft 365 sensitivity labels still apply to the note and the files made from it.
- **An edit is a proposal.** Nothing is written until the person approves that edit of that note as it is now.

## The source

- `skill/thoughtknot-graph-notes/SKILL.md` and `reference/commands.md` — what Cowork loads. Keep SKILL.md short.
- `src/cowork.ts` — what the script does: `clear` (the gate), `read`, `draw`, `propose` and `apply`. `COWORK_LIMITS`
  holds the size limits the package is checked against. They are our best reading of Cowork's; check them against
  Cowork when its docs say more.
- `src/raster.ts` — the PNG. Cowork's sandbox has no picture library, so this paints the SVG's shapes and text itself
  and writes the PNG with node's zlib. Its letters are a small built-in set (plain letters, digits and punctuation).
  Other characters are drawn as a question mark, and the card says how many. The SVG beside it shows every character.
- `bin/thoughtknot.ts` — the command line Cowork runs. It answers in JSON.
- `esbuild.config.mjs` — bundles the script as one file. The release script (`scripts/cowork-release.mjs`) builds the
  `.skill` file from it and attaches it to each release, beside the library's packages.

## Tests

`test/cowork-skill.test.js` proves the skill. `test/cowork-release.test.js` proves the build and the workflows.
