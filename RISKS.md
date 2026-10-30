# Known risks

What the expert panel found, and what was decided. The release waits on this list: see RELEASING.md.
Made by `node scripts/risk-register.mjs --write-report` from `quality/risks.json`. Do not edit by hand.

Dots show likelihood and impact: ●●● high, ●●○ medium, ●○○ low.

## Open (44)

| Id | Risk | Likely | Impact | Decision | Effort |
| --- | --- | --- | --- | --- | --- |
| SEC-3 | Claude's data-folder guard admits a bypass by shell paths | ●○○ | ●●● | fix-later (Wave 11 · Slice 8 permissions, AI and export) | days |
| SEC-4 | Session token drawn in a pane Claude may read | ●○○ | ●●○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | days |
| SEC-9 | Export accepts any text under an .svg name | ●○○ | ●○○ | fix-later (Roger’s held changes, after all waves) | hours |
| CODE-3 | Coverage is measured for the core only, and only at release | ●●● | ●●○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| CODE-6 | 77 fixed sleeps remain in 26 plugin test files | ●●○ | ●○○ | fix-later (Wave 5 · Automated quality and releases) | days |
| CODE-11 | A running layout is never cancelled when the user keeps typing | ●●○ | ●○○ | fix-later (Roger’s held changes, after all waves) | hours |
| CODE-12 | The server keeps no copy of the note it overwrites | ●○○ | ●●○ | fix-later (Roger’s held changes, after all waves) | hours |
| ARCH-7 | Whole-note text is the only store; nothing indexes across notes | ●●○ | ●●○ | fix-later (Wave 13 · Slice 9 store, sync and network) | weeks |
| ARCH-8 | Exports read back only by test helpers; no product import | ●●○ | ●○○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | days |
| UX-3 | Many user-facing sentences bypass the word catalogue and its checks | ●●● | ●●○ | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | days |
| UX-4 | No busy state while a layout runs, and a silent stop after failures | ●●○ | ●●● | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | days |
| UX-8 | First-run syntax help is only in the wiki, not in the app | ●●○ | ●●○ | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | days |
| UX-10 | Design screenshots show the old 'Graph Note' brand and version | ●●● | ●○○ | fix-later (Roger’s held changes, after all waves) | hours |
| NEURO-1 | No vault-wide list of graphs, cross-note links or one-shot backup | ●●● | ●●● | fix-later (Wave 13 · Slice 9 store, sync and network) | days |
| NEURO-2 | Changes and history view exist only in the browser editor | ●●● | ●●○ | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | days |
| NEURO-3 | Ten icon-only toolbar buttons, no visible tooltip, nothing can be hidden | ●●● | ●●○ | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | hours |
| NEURO-6 | Every notice vanishes after five seconds and cannot be read again | ●●● | ●●○ | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | hours |
| NEURO-7 | Drawing redraws 250 ms after typing; picture may jump | ●●○ | ●●○ | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | days |
| NEURO-8 | No two-minute first success: no insert-example command | ●●● | ●●○ | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | hours |
| NEURO-9 | No reading options: letter spacing, line height or font | ●●○ | ●○○ | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | days |
| NEURO-11 | No recently edited or recently visited list | ●●○ | ●○○ | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | hours |
| FLOW-4 | A one-line fix pays eleven gates and may touch four records | ●●● | ●●○ | fix-later (Wave 5 · Automated quality and releases) | days |
| FLOW-6 | Store submission is last, with no CI step for its checklist | ●●○ | ●●● | fix-later (Wave 15 · Obsidian community release) | days |
| FLOW-9 | No per-file MPL notice, and no test holds that choice | ●●○ | ●○○ | fix-later (Wave 15 · Obsidian community release) | hours |
| FLOW-10 | Issue templates and conduct contact point at closed doors | ●●○ | ●○○ | fix-later (Wave 15 · Obsidian community release) | hours |
| FLOW-11 | Decisions live in two places with different forms | ●●○ | ●○○ | fix-later (Wave 5 · Automated quality and releases) | hours |
| FLOW-12 | Third-party notices depend on a hand-kept record | ●○○ | ●●○ | fix-later (Roger’s held changes, after all waves) | hours |
| API-9 | AI transport is hard-wired to the OpenAI chat shape | ●●● | ●○○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | days |
| API-11 | Schema @1 is a name suffix, not a version negotiation | ●○○ | ●○○ | fix-later (Roger’s held changes, after all waves) | hours |
| AI-2 | Classification gate guards the pane only, not Claude's own reads | ●●● | ●●● | fix-later (Wave 11 · Slice 8 permissions, AI and export) | days |
| AI-4 | Answers are free text parsed by brace slicing, not structured output | ●●○ | ●●○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | days |
| AI-5 | No cost ceiling, token cap, usage record or prompt caching | ●●○ | ●●○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | days |
| AI-6 | No eval set: a model change cannot be judged safe | ●●● | ●●○ | fix-later (Wave 24 · Held: text to graph with AI) | days |
| AI-7 | Only the chat-completions wire shape; Anthropic Messages API unreachable | ●●● | ●●○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | days |
| AI-8 | No MCP server or SKILL.md exposes the graph format | ●●● | ●●○ | fix-later (Wave 28 · Held: Claude presents and decides in Claude Code) | weeks |
| AI-9 | Planned AI waves are ordered against value and risk | ●●○ | ●●○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | hours |
| AI-10 | Text to graph has no quality measure in its plan | ●●● | ●●○ | fix-later (Wave 24 · Held: text to graph with AI) | days |
| TRUST-8 | A database import has no size or time limit | ●○○ | ●○○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | days |
| TRUST-11 | /graph checks the note, then reads it again to draw | ●○○ | ●○○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | hours |
| TRUST-12 | The gate settings and the confirmed digest travel in the environment | ●○○ | ●○○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | hours |
| TRUST-13 | Shared schemas sent to an AI skip their own class | ●○○ | ●○○ | fix-later (Wave 11 · Slice 8 permissions, AI and export) | hours |
| LEGAL-3 | The iPhone app's encryption has no export answer yet | ●●○ | ●●● | fix-later (Wave 14 · Slice 9 web, corporate and iOS) | days |
| SEC-17 | The desktop app's signing keys sit in the build step on main | ●○○ | ●●● | fix-later (Wave 7 · Language, theming, the standalone app and massive graphs) | hours |

## Each open risk

### SEC-3 Claude's data-folder guard admits a bypass by shell paths

**Who found it:** Senior security engineer. **Where:** `packages/claude-code/src/data-guard.ts`, `packages/claude-code/src/editor-launch.ts`, `packages/core/src/claude-gate.ts`.

**Risk:** settings.json in the mod's data folder sets Claude's own classification ceiling. The guard says it cannot see a path the shell builds (cd then a bare name, or an unlisted variable). A prompt-injected session could loosen its own gate and then open a note classified above it.

**Fix:** Record the digest of settings.json when the session starts. Have the gate refuse to open any note when the file's digest has changed during the session, until the person confirms.

**Check:** A test in packages/claude-code/test that rewrites settings.json mid-session and asserts the next /graph edit is refused.

### SEC-4 Session token drawn in a pane Claude may read

**Who found it:** Senior security engineer. **Where:** `packages/claude-code/src/editor-launch.ts`, `packages/claude-code/src/graph-view.ts`, `packages/claude-code/src/editor-words.ts`.

**Risk:** The page address with the session token is handed to the Graph editor pane to draw, and the spec says Claude can read that pane. With the token, Claude could PUT the note directly and skip the proposal-only route the person is meant to accept.

**Fix:** Have the mod open the browser itself, or draw a button whose target is held outside pane text. Then the token never appears in any text Claude can read.

**Check:** A test asserts no pane text and no transcript line ever contains `token=`.

### SEC-9 Export accepts any text under an .svg name

**Who found it:** Senior security engineer. **Where:** `packages/claude-code/server/export-api.ts`.

**Risk:** The export route checks a PNG's bytes but writes any text given as .svg, .md, .csv or .graphml. If the page were ever compromised, it could drop an SVG with a script into the vault, which runs when opened in a browser. The panel proposes accepting this risk; the owner decides.

**Fix:** If wanted: refuse an .svg whose text holds <script, on* attributes, <foreignObject or a javascript: address, as a second line behind the page's CSP.

**Check:** A test PUTs an SVG with a script element and asserts 400.

### CODE-3 Coverage is measured for the core only, and only at release

**Who found it:** Senior coder and QA / test engineer. **Where:** `scripts/quality-suite.mjs`, `quality/baseline.json`, `.github/workflows/ci.yml`.

**Risk:** The 99.2% figure in quality/baseline.json covers packages/core/src alone. The Obsidian plugin, the server and the page have no coverage number at any time. CI runs quality-check with --fast, so a pull request that drops the core's coverage is seen only when a release is cut.

**Fix:** Widen --test-coverage-include to packages/*/src, packages/claude-code/server and page. Record one baseline per package. Run the coverage step in CI on pull requests that touch a package.

**Check:** quality-check.mjs holds each package's coverage_percent against its baseline on every pull request, not only at release.

### CODE-6 77 fixed sleeps remain in 26 plugin test files

**Who found it:** Senior coder and QA / test engineer. **Where:** `packages/obsidian/test/**`, `packages/core/test/layout-worker.test.js`, `test/fixed-sleeps.json`.

**Risk:** The ratchet stops new sleeps but keeps the old ones, 10 in settings.test.js and 8 in graph-view-parked.test.js. On a slow CI runner one of these fails now and then. The full suite runs on main after every merge and before a release, so a release waits on a rerun.

**Fix:** Replace each sleep with the test support's `until` on the state asserted, one file per pull request, and run --tighten after each.

**Check:** The existing fixed-sleeps ratchet, plus a quality metric that fails when the total allowance stops falling across two releases.

### CODE-11 A running layout is never cancelled when the user keeps typing

**Who found it:** Senior coder and QA / test engineer. **Where:** `packages/core/src/layout-worker.ts`, `packages/core/src/display/editor/pane-drawing.ts`.

**Risk:** A new edit replaces only layouts still queued for the same owner. The one already in the worker runs to its end, and its result is then dropped as stale. On a large graph each keystroke waits behind a layout nobody wants, so the drawing lags further the more the person types. The panel proposes accepting this risk; the owner decides.

**Fix:** When a newer job for the same owner arrives while its earlier one is busy, terminate and restart the worker. The timeout path already does this. Do not wait for the old job.

**Check:** manual

### CODE-12 The server keeps no copy of the note it overwrites

**Who found it:** Senior coder and QA / test engineer. **Where:** `packages/claude-code/server/note-file.ts`, `packages/claude-code/server/note-drafts.ts`.

**Risk:** The write is atomic and fsynced, so a crash leaves the old or the new note whole. But the earlier text is kept only when the note's folder is a git repository. Take a note outside git where a good write carried a bad edit. It has no earlier version the changes view or the person can go back to. The panel proposes accepting this risk; the owner decides.

**Fix:** Before the rename, copy the note's current bytes into the drafts folder under its digest name as a one-deep 'before' record. Offer it in the changes view when git has no history.

**Check:** manual

### ARCH-7 Whole-note text is the only store; nothing indexes across notes

**Who found it:** Enterprise, solution and data architect. **Where:** `packages/core/src/sources.ts`, `packages/core/src/hosts/vault-folder.ts`, `scripts/instruction-counts.mjs`.

**Risk:** Limits inside one note are stated and tested (2,000 things drawn, 1 MB and 20,000 lines read). Beyond one note there is no index. Views across notes and the mesh will reread every file, and no test holds a vault of thousands of notes.

**Fix:** Before W10 (sources across notes) widens, add a derived-store seam. This is an index rebuilt from text, as five_layer_stack already asks. Add one benchmark over a 5,000-note vault in scripts/instruction-counts.mjs.

**Check:** A multi-note benchmark in the quality ratchet with a stated ceiling.

### ARCH-8 Exports read back only by test helpers; no product import

**Who found it:** Enterprise, solution and data architect. **Where:** `packages/core/src/export-data*.ts`, `packages/core/src/sources.ts`, `packages/core/test/export-data-readers.js`.

**Risk:** GraphML, CSV and GQL exports round-trip in tests. But the readers used are test-only code. So a user cannot bring a GraphML or CSV file back in. A format tested only one way can drift from what real tools write.

**Fix:** In W27 (Wave 11), add CSV and GraphML as sources through the plug-in interface. Or state in the user guide that export is one way.

**Check:** The exporter contract gains a read-back check once an importer exists; until then, manual.

### UX-3 Many user-facing sentences bypass the word catalogue and its checks

**Who found it:** User experience lead and accessibility specialist. **Where:** `packages/core/src/**`, `packages/obsidian/src/**`, `packages/graph-spec/src/reader/parser.js`, `test/pseudo-locales.test.js`.

**Risk:** The catalogue has one language (en-GB) and no translation is loaded, yet dozens of sentences are typed straight in code: Obsidian notices, pane and card fallbacks, problem messages and parser errors. Hand-built plurals like `send${n === 1 ? '' : 's'}` will break in any future language, and the pseudo-locale test cannot see any of it.

**Fix:** Move these strings into the catalogues with plural forms. Widen the pseudo-locale scan to p, h4, li, [role=status], [role=alert] text and to Obsidian notices.

**Check:** test/pseudo-locales.test.js fails on any plain English in those elements. A lint rule flags `new Notice('` and `text: '` with a sentence outside *-words.ts files.

### UX-4 No busy state while a layout runs, and a silent stop after failures

**Who found it:** User experience lead and accessibility specialist. **Where:** `packages/core/src/display/editor/pane-drawing.ts`, `packages/core/src/layout-worker.ts`, `packages/obsidian/src/layout-worker/**`, `packages/claude-code/page/layout-runner.ts`.

**Risk:** A layout may take 5 seconds, and the engine 30 seconds to start. Meanwhile the pane shows nothing or the old drawing with no sign of work. After three slow layouts drawing stops until the plugin reloads, and the user is told only in the developer console.

**Fix:** Show a `role=status` line such as 'Laying out…' with a Cancel after about 300 ms. Mark the drawing `aria-busy`. Show the 'stopped' and 'on-the-page' messages as a banner or Notice with a 'Try again' button.

**Check:** A test with a fake clock holds a layout for 400 ms and asserts the status text. Another test asserts a visible banner after TIMEOUTS_BEFORE_STOPPING failures.

### UX-8 First-run syntax help is only in the wiki, not in the app

**Who found it:** User experience lead and accessibility specialist. **Where:** `packages/core/src/display/editor/pane-drawing.ts`, `packages/obsidian/src/main.ts`, `packages/graph-spec/src/reader/parser.js`, `wiki/How-to-use-ThoughtKnot.md`.

**Risk:** An empty pane says 'Nothing to draw yet. Start with a thing.' with no example, no link to the guide and no command to insert one. Inline completion exists but the user guide never mentions it, so a new user types blind and meets a token-level parser error.

**Fix:** Give the empty states a one-line example and a 'Read the guide' link. Add an 'Insert the example graph' command. Map parser errors to catalogue words with a hint ('Close the bracket after …').

**Check:** test/ux-journey.test.js gains a stage that opens an empty block and asserts an example and guide link. test/ux-copy.test.js covers parser messages.

### UX-10 Design screenshots show the old 'Graph Note' brand and version

**Who found it:** User experience lead and accessibility specialist. **Where:** `scripts/wiki-screens.mjs`.

**Risk:** The review screenshots in project files carry the Graph Note name and 'Latest release: 0.6.0' while the code is ThoughtKnot 0.7.1. Anyone judging the UI from them judges a stale product; wiki images are regenerated, but design-review files are not. The panel proposes accepting this risk; the owner decides.

**Fix:** Take review screenshots with scripts/wiki-screens.mjs so they follow the build, or date-stamp them.

**Check:** manual

### NEURO-1 No vault-wide list of graphs, cross-note links or one-shot backup

**Who found it:** Senior UI designer, neurodiversity and personal data management. **Where:** `packages/obsidian/src/main.ts`, `packages/obsidian/src/export/**`, `packages/core/src/export*.ts`, `packages/claude-code/server/**`.

**Risk:** After a year of notes a person cannot see which notes hold graphs, which graph spans which notes, or export them all for a backup. They must remember where everything is, which is the one thing an ADHD reader cannot rely on.

**Fix:** Add one command, Graphs in this vault, that lists each graph with its notes. Add one export choice, Every graph, that writes all graphs as GQL into one folder.

**Check:** A test opens the test vault, runs the command and asserts every graph note is listed. Another test checks that the Every graph export writes one file per graph.

### NEURO-2 Changes and history view exist only in the browser editor

**Who found it:** Senior UI designer, neurodiversity and personal data management. **Where:** `packages/obsidian/src/**`, `packages/core/src/changes-view.ts`, `requirements/editor-requirements.gql`.

**Risk:** An Obsidian user who accepts a drag edit or a proposal cannot look back later. They cannot see what the tool changed in the note. If something looks wrong a week on, they must read raw text and remember.

**Fix:** In Obsidian, offer Compare with on the card. Use the host's file recovery snapshots or the last written text kept in plugin data. Draw it with the same changes-view.ts.

**Check:** A requirement that names Obsidian in changes_view, proved by a test in packages/obsidian/test that opens Compare with on the sample note.

### NEURO-3 Ten icon-only toolbar buttons, no visible tooltip, nothing can be hidden

**Who found it:** Senior UI designer, neurodiversity and personal data management. **Where:** `packages/core/src/display/graph-view/view-bar.ts`, `packages/core/src/settings.ts`, `packages/core/src/settings-source-words.ts`.

**Risk:** Every card shows ten icons with no visible name, so a reader must recall what each glyph means each time. Nobody can hide the buttons they never use, so the load is the same on every graph.

**Fix:** Give each bar button a tooltip in the host's style (the aria-label as title or setTooltip). Add a setting that folds the less used buttons (filter, view, export, source) behind one More button.

**Check:** Extend the host contract or wcag test: every button in the bar has a visible tooltip text equal to its aria-label.

### NEURO-6 Every notice vanishes after five seconds and cannot be read again

**Who found it:** Senior UI designer, neurodiversity and personal data management. **Where:** `packages/core/src/display/host.ts`, `packages/core/src/display/host-contract.ts`, `packages/obsidian/src/display-host.ts`, `packages/claude-code/page/browser-host.ts`.

**Risk:** Long messages disappear before a slow reader finishes. Examples are 'The kept drafts could not be written into … They stay kept' and 'This drawing is not on the page yet …'. There is no setting to keep them and no list of past messages.

**Fix:** Give notice() a duration that grows with the message length. Past about 80 characters, it stays until dismissed. Keep the last ten messages behind the problems badge.

**Check:** A host contract case: a notice longer than 80 characters is still shown after 10 seconds in a fake clock.

### NEURO-7 Drawing redraws 250 ms after typing; picture may jump

**Who found it:** Senior UI designer, neurodiversity and personal data management. **Where:** `packages/core/src/display/editor/typing-rests.ts`, `packages/core/src/display/graph-view/**`, `packages/core/src/zoom-across.ts`.

**Risk:** Each pause in typing re-runs the Graphviz layout and can move every box, so the picture shifts while the reader is still thinking. The spec keeps the typed box still but says nothing about keeping the drawing's boxes and viewport where they were.

**Fix:** Keep the viewport across a redraw. While a block is being edited, only re-lay out when a thing or link is added or removed, not on each property keystroke. add a setting 'Redraw while typing: after each pause / when I press Done'.

**Check:** A test in packages/core/test types a property value. It asserts the zoom and every unchanged box's place are the same after the redraw.

### NEURO-8 No two-minute first success: no insert-example command

**Who found it:** Senior UI designer, neurodiversity and personal data management. **Where:** `packages/obsidian/src/main.ts`, `packages/core/src/edit-source-words.ts`, `wiki/How-to-use-ThoughtKnot.md`.

**Risk:** A new reader must type a seven-line block by hand from the guide, with a graph line, kinds, quotes and arrows, before anything is drawn. The empty-block prompt also asks them to type a pattern, so the first minute is all syntax and no reward.

**Fix:** Add a command 'Insert an example graph'. Add a button on the empty-block prompt that writes the guide's example. The first drawing then appears in one press.

**Check:** A test in packages/obsidian/test runs the command in an empty note and asserts a drawing with three things appears. test/wiki-guide.test.js asserts step 1 names the command.

### NEURO-9 No reading options: letter spacing, line height or font

**Who found it:** Senior UI designer, neurodiversity and personal data management. **Where:** `styles.css`, `packages/core/src/theme-tokens.ts`, `packages/claude-code/page/page.css`, `packages/core/src/settings.ts`.

**Risk:** Line height and caption letter spacing are fixed in the style sheet and the settings page offers no reading choices. A dyslexic reader of the browser editor, which has no Obsidian theme, cannot loosen the text.

**Fix:** Add tokens for line height and letter spacing to theme-tokens.ts. Add one setting 'Easier reading' that raises both and widens word spacing in both hosts.

**Check:** test/theme-tokens or wcag test asserts the two tokens exist and the setting changes the computed style.

### NEURO-11 No recently edited or recently visited list

**Who found it:** Senior UI designer, neurodiversity and personal data management. **Where:** `packages/core/src/display/graph-view/details-summary.ts`, `packages/obsidian/src/main.ts`.

**Risk:** The details trail gives back and forward inside one graph. Kept drafts can be recovered. But nothing shows the graphs or things a person worked on yesterday. Someone who stops mid-task has no way back to where they were.

**Fix:** Keep the last ten graphs and things opened in plugin data and show them in the details summary while nothing is chosen.

**Check:** A test in packages/obsidian/test that opens two graphs and asserts the summary lists both, newest first.

### FLOW-4 A one-line fix pays eleven gates and may touch four records

**Who found it:** Workflow designer and open-source maintainer / community lead. **Where:** `package.json`, `AGENTS.md`, `.github/workflows/ci.yml`, `.github/workflows/claude-review.yml`, `scripts/**`.

**Risk:** One pull request runs 6 test shards, lint, python, python-no-engine, tests-first and public-readiness. It also runs a Claude review of up to 30 minutes, the project mirror and the build status. A test or doc change must also carry a tests-first record, a plain-docs record, public-api.json or a quality baseline. Each is written by a script the author must know to run.

**Fix:** Add one script, `npm run prepare-pr`, that runs tests-first --update, plain-docs --update, public-api --update and notices.mjs in order, and name it in AGENTS.md. Skip the Claude review and public-readiness setup check for docs-only changes by path filter.

**Check:** A CI step that runs prepare-pr and fails on a dirty tree, so a forgotten record is one message, not four.

### FLOW-6 Store submission is last, with no CI step for its checklist

**Who found it:** Workflow designer and open-source maintainer / community lead. **Where:** `manifest.json`, `versions.json`, `.github/workflows/release.yml`, `requirements/waves.json`, `packages/obsidian/**`.

**Risk:** The community listing is one requirement in Wave 15, March 2027, and the Obsidian review queue takes months. No workflow runs the store's checklist, so problems the reviewers raise are found a year from now instead of today.

**Fix:** Submit to obsidian-releases at the next stable release, in Wave 5, as a beta listing is allowed while slices continue. Add a CI step that checks manifest.json fields, the release assets and the plugin guidelines list the store publishes.

**Check:** A test that reads manifest.json, versions.json and the release workflow against the store's documented rules; release.yml fails when they drift.

### FLOW-9 No per-file MPL notice, and no test holds that choice

**Who found it:** Workflow designer and open-source maintainer / community lead. **Where:** `packages/graph-spec/**`, `python/graph_spec/**`, `.github/workflows/release.yml`, `test/licences.test.js`.

**Risk:** MPL-2.0 Exhibit A asks each source file to carry the notice, or a LICENSE file where a reader would look. 705 source files carry none. This is allowed only if LICENSE sits at every published root. The single-file graph-spec build and the Python wheel ship as separate artefacts.

**Fix:** Add the short SPDX line `// SPDX-License-Identifier: MPL-2.0` to the banner of the built graph-spec file and the Python package's __init__. Include LICENSE in the libraries archive and the wheel.

**Check:** test/licences.test.js asserts the built single file and the archive carry the notice or LICENSE.

### FLOW-10 Issue templates and conduct contact point at closed doors

**Who found it:** Workflow designer and open-source maintainer / community lead. **Where:** `.github/ISSUE_TEMPLATE/**`, `.github/SUPPORT.md`, `CODE_OF_CONDUCT.md`, `test/community-files.test.js`.

**Risk:** Issues are collaborators-only, yet two issue templates and a 'bug' label exist, and SUPPORT.md routes bugs to Discussions Q&A instead. The code of conduct's contact is an email on a GitHub profile that may be hidden, so a report may have nowhere to go.

**Fix:** Put a project address (a mailbox Roger owns) in CODE_OF_CONDUCT.md. Either open issue creation to everyone with the two templates, or delete the templates until then. Say in config.yml that bugs go to Discussions.

**Check:** test/community-files.test.js asserts the conduct file names an address, and that issue templates exist only when public-readiness wants issues open to all.

### FLOW-11 Decisions live in two places with different forms

**Who found it:** Workflow designer and open-source maintainer / community lead. **Where:** `requirements/editor-requirements.gql`, `scripts/wiki.mjs`, `CONTRIBUTING.md`.

**Risk:** The wiki's Decisions page is made only from answered Question nodes in the requirements. Decisions written as '(Roger, 16 Oct 2026)' remarks sit in comments and CONTRIBUTING.md. One example is dropping the vault as the requirements source. They never reach that page, so a reader cannot find why things are as they are.

**Fix:** Record each '(Roger, date)' decision as a Question node with its answer and date, starting with the vault decision. Then the Decisions page lists them all. Say in CONTRIBUTING.md that a dated remark must have its Question.

**Check:** A test that finds every '(Roger, <date>)' remark in requirements and docs and requires a Question node answered on that date.

### FLOW-12 Third-party notices depend on a hand-kept record

**Who found it:** Workflow designer and open-source maintainer / community lead. **Where:** `licences/bundled.json`, `scripts/notices.mjs`, `test/licences.test.js`, `TRADEMARKS.md`.

**Risk:** THIRD_PARTY_NOTICES.md covers Graphviz (EPL-2.0), Expat, Emscripten, marked and the redrawn Lucide icons. No fonts are bundled. The record is written by hand per version. So a new bundled dependency that the test's allow-list accepts could ship before its entry and licence text are added. The panel proposes accepting this risk; the owner decides.

**Fix:** Keep as is; TRADEMARKS.md matches MPL-2.0 section 2.3 and does not restrict forks beyond the name. Add to RELEASING.md one line: run notices.mjs and diff before tagging.

**Check:** Already held by test/licences.test.js if its bundle walk is complete; otherwise manual.

### API-9 AI transport is hard-wired to the OpenAI chat shape

**Who found it:** API design expert. **Where:** `packages/core/src/ai-request.ts`, `packages/core/src/ai-choice.ts`, `packages/core/src/plugins.ts`.

**Risk:** No model id is hard-coded and the endpoint is the user's. But the body is always {model, messages[system,user]} and the reply is read from choices[0].message.content. An Anthropic Messages, Gemini or Ollama native endpoint answers 'its reply holds no message'. Nothing in the settings or docs says the address must be OpenAI-compatible.

**Fix:** Name the shape in the settings help and the wiki now. In the plug-in wave, add an AI provider extension point whose contract is requestBody and readReply, with the OpenAI shape as the built-in one.

**Check:** plugins-contract.ts suite for providers: a provider round-trips a fixed question and a fixed reply fixture.

### API-11 Schema @1 is a name suffix, not a version negotiation

**Who found it:** API design expert. **Where:** `packages/core/src/standard-schemas.ts`, `packages/core/src/schema-names.ts`.

**Risk:** decision@1 is matched as one string. An unknown name or version gives a warning that lists the versions present, and the graph's types go unchecked. A vault block named decision@1 replaces the standard one wholesale. So two vaults can mean different things by the same versioned name with no notice. The panel proposes accepting this risk; the owner decides.

**Fix:** Document in the schema section that @N is part of the name and that a vault's block shadows a standard one. Also document that a shadowing block differing from the standard text gets an info-level note.

**Check:** manual

### AI-2 Classification gate guards the pane only, not Claude's own reads

**Who found it:** AI product and engineering expert. **Where:** `packages/claude-code/mod/hooks/register.tsx`, `packages/claude-code/src/**`, `README.md`.

**Risk:** The gate stops a classified note or a credential reaching the browser pane. Claude's Read and Grep tools read the same vault files with no gate, so the highest classification still reaches the model whenever Claude looks.

**Fix:** State plainly in README and GUIDE that the gate covers only what the mod shows, and that Claude Code's file tools are outside it. Then hook Read and Grep on vault paths through claudeGate (credential and top-level refusals at least), with the same fail-closed rule as the data guard.

**Check:** A mod test raising tool.call Read on a note with a private key, asserting deny. Extend test/ai-disclosed.test.js to require the sentence about Claude Code's own tools.

### AI-4 Answers are free text parsed by brace slicing, not structured output

**Who found it:** AI product and engineering expert. **Where:** `packages/core/src/ai-request.ts`.

**Risk:** The request sets only model and messages: no response schema, no max_tokens, no finish_reason check. A cut-off or chatty reply is reported as 'JSON cannot be read' with no hint why, and quality depends on the model obeying prose.

**Fix:** In Wave 11 send a JSON schema for {changes[]}. Use response_format json_schema on chat-completions endpoints and output_config.format on the Anthropic Messages API. Set max_tokens, and read finish_reason so a truncated answer says 'cut short'. Keep changesIn as the second check.

**Check:** ai-request.test.js asserts the body carries the schema and max_tokens, and a reply with finish_reason length is said as truncated.

### AI-5 No cost ceiling, token cap, usage record or prompt caching

**Who found it:** AI product and engineering expert. **Where:** `packages/core/src/ai.ts`, `packages/core/src/ai-request.ts`, `packages/core/src/settings.ts`.

**Risk:** ai-ceiling.ts is a classification ceiling. Nothing bounds spend. Today each send is one click, so cost is bounded by the user. Text to graph on whole notes and agent loops in Waves 19 and 23 remove that bound.

**Fix:** Record the reply's usage object in SendRecord. Show the byte size already computed as an estimate before send. Add max_tokens, and a per-day send count setting that refuses beyond it. Prompt caching matters only once the same graph is sent repeatedly (Wave 28). Then put the graph first and stable.

**Check:** ai.test.js asserts a record carries usage when the reply gives it, and a send past the daily count is refused in words.

### AI-6 No eval set: a model change cannot be judged safe

**Who found it:** AI product and engineering expert. **Where:** `test/fixtures/**`, `scripts/**`, `quality/**`.

**Risk:** Every AI test drives a fake transport with hand-written replies, so the suite proves plumbing, never answer quality. Changing the prompt, the default model or the wire shape passes CI whether or not real answers get worse.

**Fix:** Add test/fixtures/ai/<case>/{note.md, question.txt, expected.json} with ten recorded cases. Add an opt-in script scripts/eval-ai.mjs that calls a configured endpoint. It scores precision and recall of things and links against expected, and writes quality/ai.json held by the ratchet. CI runs only the offline replay.

**Check:** scripts/quality-check.mjs holds quality/ai.json figures; the replay test runs in npm test with no network.

### AI-7 Only the chat-completions wire shape; Anthropic Messages API unreachable

**Who found it:** AI product and engineering expert. **Where:** `packages/core/src/ai-request.ts`, `packages/core/src/ai.ts`.

**Risk:** The request is OpenAI chat-completions with a Bearer header, and the reply is read from choices[0].message.content. The Anthropic API wants POST /v1/messages with x-api-key and anthropic-version. It answers with content blocks. So a model named Claude must sit behind a compatibility proxy.

**Fix:** In Wave 11 add a second request shape in the core, chosen by the endpoint path (/v1/messages). Its headers are x-api-key and anthropic-version. Its body holds model, max_tokens, system, messages and output_config.format for the schema. Read content[].text. Model ids are the user's; show the current ids from the Anthropic models endpoint rather than hard-coding one.

**Check:** ai-request.test.js shape cases for both endpoints; the shown headers name the key by name for both.

### AI-8 No MCP server or SKILL.md exposes the graph format

**Who found it:** AI product and engineering expert. **Where:** `packages/graph-spec/**`, `packages/core/src/claude-gate.ts`, `packages/mcp/**`.

**Risk:** The only agent surface is a mod tool named mcp__thoughtknot__propose inside Claude Code. No other agent, editor or chat can read, check or propose a graph. Waves 18 and 24 each plan their own surface, so the same gate logic will be written three times.

**Fix:** Build the minimum local stdio MCP server from graph-spec and the core now, before Wave 28. Its tools are read_graph(path) through claudeGate, check_changeset(path, block) and propose(path, changes), which writes the change set beside the graph. Notes only under one named folder, and no network. A ten-line SKILL.md then points any host at it, which is most of Wave 23.

**Check:** test/mcp-app.test.js lists the three tools, proves a top-classification note is refused and that propose never touches the graph block.

### AI-9 Planned AI waves are ordered against value and risk

**Who found it:** AI product and engineering expert. **Where:** `requirements/waves.json`, `requirements/workstreams.json`, `requirements/editor-requirements.gql`.

**Risk:** Wave 23 (a Copilot Cowork skill) and Wave 29's remote connector come with the most host-specific code and the least reuse. The local MCP server, structured output and source citation each unlock several waves and are not on the plan as steps of their own.

**Fix:** Reorder the work. First, a local MCP server with the gate. Second, the one text-to-graph contract with schema output and a source span per change. Third, the Claude Code write hook of AI-1. Hold Wave 23 to a SKILL.md over the MCP server. Keep mcp_app_remote as should and after a security review, as written.

**Check:** manual

### AI-10 Text to graph has no quality measure in its plan

**Who found it:** AI product and engineering expert. **Where:** `requirements/editor-requirements.gql`, `test/fixtures/**`, `quality/**`.

**Risk:** The planned tests prove the action is gated, shown and recorded, not that the graph it proposes is right. Without a measure the feature ships on anecdote and a model change can halve its accuracy unnoticed.

**Fix:** Add a requirement text_to_graph_measured. It needs fixtures of prose with an expected graph under test/fixtures/text-to-graph/. It also needs a deterministic scorer (things and links matched by name or alias, source span overlap). Add an optional cheap judge model for property texts. Hold a floor in quality/ai.json.

**Check:** scripts/quality-check.mjs refuses a release when text-to-graph recall or precision drops below the baseline without a reason in quality/accepted.json.

### TRUST-8 A database import has no size or time limit

**Who found it:** Trust model review. **Where:** `packages/obsidian/src/databases/**`.

**Risk:** The import reads the whole file and runs the query on the main thread with no time limit. It caps rows only once all are in memory. A large file or a looping query hangs Obsidian. Imported values are not held to the note's class.

**Fix:** Refuse a file above the read limit and stop a query after a time limit. Stop reading at the row limit, and scan the values for credentials.

**Check:** packages/obsidian/test/databases.test.js refuses a file over the limit, a looping query and a credential in a value.

### TRUST-11 /graph checks the note, then reads it again to draw

**Who found it:** Trust model review. **Where:** `packages/claude-code/mod/hooks/register.tsx`.

**Risk:** The gate reads the note, then the drawing reads it a second time. Text that changes in between is drawn without being checked.

**Fix:** Read the note once and pass the same text to the gate and to the drawing.

**Check:** packages/claude-code/test/register.test.js: the text drawn is the text the gate saw.

### TRUST-12 The gate settings and the confirmed digest travel in the environment

**Who found it:** Trust model review. **Where:** `packages/claude-code/src/editor-launch.ts`, `packages/claude-code/src/editor-settings-env.ts`.

**Risk:** The server gets its gate settings and the digest of a note the person confirmed through its environment. Another process of the same user can read them, or start the server with its own.

**Fix:** Send the settings and the digest on stdin with the proposer key, and read nothing gate-related from the environment.

**Check:** packages/claude-code/test/editor-launch.test.js: the server's environment holds no gate setting or digest.

### TRUST-13 Shared schemas sent to an AI skip their own class

**Who found it:** Trust model review. **Where:** `packages/core/src/ai-scope.ts`, `packages/obsidian/src/ai/ai.ts`.

**Risk:** The AI scope takes in the vault's shared schemas, but only the class of the note being asked about is checked. A schema kept in a note of a higher class can be sent.

**Fix:** Hold each schema to the class of the note it came from. Leave out one above the ceiling, and show the reason.

**Check:** packages/core/test/ai-scope.test.js: a schema from a note above the ceiling is left out and named.

### LEGAL-3 The iPhone app's encryption has no export answer yet

**Who found it:** Senior security engineer. **Where:** `requirements/editor-requirements.md`, `packages/app/**`.

**Risk:** ios_app keeps notes encrypted with keys in the Keychain, and sync may add more. TestFlight, the App Store and notarising each ask about encryption, and some answers need a report in the US or France. A wrong answer can pull the app.

**Fix:** Before the first TestFlight build, a lawyer confirms the export answer and any report due. Use Apple's own encryption where possible. Set ITSAppUsesNonExemptEncryption to match.

**Check:** A person checks, with a lawyer, before the first TestFlight build. Then a test holds the Info.plist value.

### SEC-17 The desktop app's signing keys sit in the build step on main

**Who found it:** Senior security engineer. **Where:** `.github/workflows/desktop-app.yml`, `scripts/desktop-build.mjs`.

**Risk:** On a push to main the desktop build step holds the Apple certificate and the Linux GPG key, because Tauri signs while it builds. A crate's build script runs in that step and could read them. A pull request build never gets them.

**Fix:** Sign the Linux .deb in a job of its own, which downloads the built file and runs no repository build. Give the macOS keys to the bundling step alone, after the Rust build ends in a step without them.

**Check:** test/desktop-build.test.js: keys reach the build only off pull requests. Each is under its own name, and nowhere else in the job.

## Done or accepted (88)

| Id | Risk | Decision | Closed by |
| --- | --- | --- | --- |
| SEC-1 | Python library runs note guards through eval | done | #614 |
| SEC-2 | SECURITY.md promises rest on settings nothing in CI checks | done | #1535; kept out by `test/settings-check.test.js`, `.github/workflows/settings-check.yml` |
| SEC-5 | Nightly pre-release is not attested | done | #1535; kept out by `test/nightly-workflow.test.js`, `.github/workflows/nightly.yml` |
| SEC-6 | Store assets are never rebuilt and compared | done | #1535; kept out by `test/reproducible-build.test.js`, `scripts/reproducible-build.mjs` |
| SEC-7 | SCXML parsed with lxml's default entity handling | done | #1537; kept out by `python/graph_spec/tests/test_optional_imports_safe_parser.py`, `python/graph_spec/src/graphspec/engine/optional_imports.py` |
| SEC-8 | Two personal tokens live in workflows with unverified scope | done | #1535; kept out by `test/secrets-recorded.test.js`, `RELEASING.md` |
| SEC-10 | No advisory audit for the Python dependencies in CI | done | #1535; kept out by `test/python-audit.test.js`, `.github/workflows/ci.yml` |
| OPS-1 | One person holds every key, with no written recovery | done | #614, #620 |
| OPS-2 | A tag on any commit becomes a stable release | done | #614 |
| OPS-3 | No written release steps, draft publishing or rollback | done | #614 |
| OPS-4 | Every job without a time limit can hold a runner six hours | done | #614, #620 |
| OPS-5 | The release waits on live OSV and NVD, with no retry | done | #1540; kept out by `test/engine-version-retry.test.js`, `scripts/engine-version.mjs` |
| OPS-6 | Failures of nightly, wiki, Pages and advisories are silent | done | #1540; kept out by `test/report-failure-workflow.test.js`, `.github/workflows/report-failure.yml` |
| OPS-7 | Timed workflows pause and tokens expire without notice | done | #1540; kept out by `test/report-failure-workflow.test.js`, `.github/workflows/token-watch.yml` |
| OPS-8 | Repository settings are not exported; only required checks are held | done | #1540; kept out by `test/settings-export.test.js`, `scripts/settings-export.mjs` |
| OPS-9 | Docker base, uv and Node pins are never bumped; no SBOM | done | #1540; kept out by `test/process-risks-ops.test.js`, `.github/dependabot.yml` |
| OPS-10 | A runner change or one flaky test blocks the release | done | #1540; kept out by `test/record-spread.test.js`, `scripts/record-spread.mjs` |
| OPS-11 | Wiki and Pages depend on Chrome being on the runner image | done | #1540; kept out by `test/process-risks-ops.test.js`, `.github/workflows/wiki.yml` |
| OPS-12 | Docs disagree with the workflows on schedules and write access | done | #1540; kept out by `test/process-risks-ops.test.js`, `CONTRIBUTING.md` |
| CODE-1 | The graph-spec library is not type-checked at all | done | #1543 |
| CODE-2 | merge3, 306 untyped lines, is proved by one snapshot case | done | #1543 |
| CODE-4 | The Claude Code mod is outside typecheck, lint and CI | done | #1560; kept out by `test/mod-check.test.js`, `scripts/mod-check.mjs`, `packages/claude-code/mod/tests/graph.test.tsx` |
| CODE-5 | No test runs vault.process with a real interleaving | done | #1546 |
| CODE-7 | 139 of 249 core modules have no test named after them | done | #1542 |
| CODE-8 | Reader parity rests on a small, snapshot-shaped case set | done | #1543 |
| CODE-9 | 28 functions over 100 lines; the 400-line cap is on files | done | #1542 |
| CODE-10 | Live Preview hands a hand-made context to the block renderer | done | #1542 |
| ARCH-1 | Host contract covers display only; files and settings copied per host | done | #1548 |
| ARCH-2 | Storage interface exists only as EditorNote, with no contract suite | done | #1542 |
| ARCH-3 | Layering is not held across packages; hosts reach into core internals | done | #1544 |
| ARCH-4 | The note format carries no version and has no migration story | done | #1073, #1076 |
| ARCH-5 | Two hand-kept parsers, no grammar; drift caught only on listed cases | done | #1543 |
| ARCH-6 | Identity is the visible name; no stable id survives a rename | done | #1084 |
| ARCH-9 | The JavaScript library is private TypeScript sources in an archive | done | #1544 |
| ARCH-10 | Three decisions that cost most if left after their wave | done | #1542 |
| ARCH-11 | The graph spec the code cites is not in the repo | done | #619 |
| ARCH-12 | Plug-in API is one version string for all future extension points | done | #885; kept out by `packages/core/test/plugin-versions.test.js` |
| UX-1 | The 21-item accessibility walk-through has never been recorded or gated | done | #619 |
| UX-2 | Half the manual walk-through could run on the existing Chrome harness | done | #1550 |
| UX-5 | A drag on the card writes outside the note's editor undo path | done | #1550 |
| UX-6 | The site points to issues that outside users cannot open | done | #615 |
| UX-7 | Landing page and guide state no system requirements or AI data flow | done | #1550 |
| UX-9 | Focus on a drawing box is a thicker stroke, measured by nobody | done | #1550 |
| NEURO-4 | Error text cites spec sections and is shown twice at once | done | #619 |
| NEURO-5 | Colour-never-alone rule has no test, yet ethos says it is checked | done | #1550 |
| NEURO-10 | Renaming a thing does not follow to other notes | done | #1073 |
| FLOW-1 | Docs invite outside pull requests; the settings forbid them | done | #615 |
| FLOW-2 | DCO sign-off is asked for, never checked, and signed by an AI | done | #621 |
| FLOW-3 | Waves 1 to 3 are past, mostly unproved, and never replanned | done | #616 |
| FLOW-5 | A requirement's text can be rewritten to fit the code | done | #1564; kept out by `test/check-requirements-reworded.test.js`, `scripts/check-requirements-flips.mjs` |
| FLOW-7 | README status line is hand-written and already wrong | done | #615 |
| FLOW-8 | AI sessions lack the merge and record rules they need | done | #615 |
| API-1 | Half the shipped graph-spec exports sit outside the break check | done | #1543 |
| API-2 | Core is guarded as a library but never shipped as one | done | #1544 |
| API-3 | Host contract version is a hand-typed number | done | #614 |
| API-4 | Local server has two error formats and no shared schema | done | #1546 |
| API-5 | Version promise and API changes are never told to users | done | #615 |
| API-6 | Python library is loose files, not an installable package | done | #1545 |
| API-7 | Python public surface is everything, private names included | done | #1545 |
| API-8 | graph-spec is CommonJS-only with a partial d.ts and mixed errors | done | #1543 |
| API-10 | Plug-in API version is one string, no host loads third parties | done | #908 |
| API-12 | No runnable examples for either library, none in CI | done | #1083 |
| AI-1 | In Claude Code the proposal route is optional, not mandatory | done | #618 |
| AI-3 | Note text enters prompts with no data boundary or injection test | done | #618 |
| AI-11 | Consent is per send, but residency and retention are unsaid | done | #618 |
| TRUST-1 | Claude can loosen its own gate by editing vault files | done | #836; kept out by `packages/claude-code/test/gate-guard.test.js` |
| TRUST-2 | MultiEdit and other write tools are not hooked | done | #836; kept out by `packages/claude-code/test/data-guard.test.js` |
| TRUST-3 | The stable release builds and publishes in one job | done | #1535; kept out by `test/release-split.test.js`, `.github/workflows/release.yml` |
| TRUST-4 | GitHub titles and messages reach Claude's pane unfenced | done | #1539; kept out by `packages/claude-code/test/editor-changes.test.js`, `packages/claude-code/test/editor-gate.test.js`, `packages/core/src/github-review-items.ts` |
| TRUST-5 | Any commenter can wake the working-group agent, which writes its own checker | done | #836; kept out by `test/working-group-workflow.test.js`, `test/claude-workflows.test.js` |
| TRUST-6 | Python fill recipes read outside the folder and inject into the query | done | #1537; kept out by `python/graph_spec/tests/test_fill_contained.py`, `python/graph_spec/src/graphspec/engine/documents/fill.py` |
| TRUST-7 | Nothing cleans the drawing before it enters the page | done | #1539; kept out by `packages/core/test/svg-allowlist.test.js`, `packages/core/src/svg-allowlist.ts` |
| TRUST-9 | The Python class reader is looser than the core gate | done | #1537; kept out by `python/graph_spec/tests/test_classification.py`, `packages/core/test/classification-cases.json` |
| TRUST-10 | git log still reads the repository's own settings | done | #1537; kept out by `packages/claude-code/test/note-history.test.js`, `packages/claude-code/server/note-history.ts` |
| TRUST-14 | Plug-ins run with the host's full powers | done | #882; kept out by `packages/core/test/plugins-isolated.test.js` |
| TRUST-15 | A plug-in given secrets could read every secret, AI keys too | done | #856; kept out by `packages/core/test/plugins-limits.test.js` |
| TRUST-16 | The files ability reaches every note, whatever its class | done | #867; kept out by `packages/core/test/plugins-limits.test.js` |
| SEC-11 | Patterns that run slow on text made for them | done | #901; kept out by `test/code-scanning-fixes.test.js`, `test/code-scan.test.js`, `scripts/code-scan.mjs` |
| SEC-12 | Comments and tags taken out in one pass | done | #901; kept out by `test/code-scanning-fixes.test.js`, `test/code-scan.test.js`, `scripts/code-scan.mjs` |
| SEC-13 | A test checked a web address by part of its text | done | #901; kept out by `test/code-scanning-fixes.test.js`, `test/code-scan.test.js`, `scripts/code-scan.mjs` |
| SEC-14 | A name in a graph could reach an object's prototype | done | #901; kept out by `test/code-scanning-fixes.test.js`, `test/code-scan.test.js`, `scripts/code-scan.mjs` |
| SEC-15 | Page code built from text without escaping | done | #901; kept out by `test/code-scanning-fixes.test.js`, `test/code-scan.test.js`, `scripts/code-scan.mjs` |
| SEC-16 | The desktop app's Linux build carries glib 0.18, with a known unsoundness | accepted | Roger, 22 Oct 2026 (decision card on PR #905): No code in the app's dependencies calls VariantStrIter. It is the Linux build only. No fixed glib works with Tauri yet. Undo when Tauri supports GTK 4. |
| LEGAL-1 | The iPhone app names install ways Apple keeps for testers, not the public | done | #1057 |
| LEGAL-2 | No privacy page the apps and the App Store can link to | done | #1062 |
| LEGAL-4 | Notarising signs in with Roger's Apple Account, not a key of its own | done | #1054; kept out by `test/desktop-build.test.js` |
| SEC-18 | Tests that read a drawing with patterns that run slow | done | #1110; kept out by `test/code-scanning-fixes.test.js`, `test/code-scan.test.js`, `scripts/code-scan.mjs` |
| SEC-19 | Time-related attacks on history, sync and shared links are not yet reviewed | done | #1489; kept out by `packages/core/test/temporal-security.test.js`, `packages/core/src/temporal.ts` |
| SEC-20 | The code scan read only the code, not the Python library or the workflows | done | #1367; kept out by `test/code-scan.test.js`, `scripts/code-scan.mjs`, `python/graph_spec/tests/test_graph_bidi.py` |
