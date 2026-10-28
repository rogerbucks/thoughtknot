# Tests that span modules

A module's tests sit in a file named after it (CONTRIBUTING.md, "Naming"). The tests below test behaviour across
modules, or the repository itself. They are named after their subject and listed here instead, each with what it
proves. A new one goes in the group of its subject. `test/conventions.test.js` fails on a test file that is neither named
after a module nor listed here, and on a listed file that is missing.

## The core: test runs

- `packages/core/test/test-run-source.test.js` — what a test run reads: live, a snapshot or a copy (editor spec §35).
- `packages/core/test/test-run-certainty.test.js` — a test run leaves certainty as it is, unless it opted in (§35).
- `packages/core/test/side-effects-stubbed.test.js` — a test run stubs each side effect and reaches nothing outside
  (§35).
- `packages/core/test/saved-scenarios.test.js` — a scenario saved from a test run is never rerun, faded or enforced
  (editor spec §35). It spans `scenarios.ts`, `test-runs.ts` and `process-core.ts`.

## The core

- `packages/core/test/connector-contract.test.js` — every connector meets one contract: statements that cite the
  place, its version and line. The join is the same for every kind of place (editor spec §63, connector_contract).
- `packages/core/test/abuse.test.js` — no sequence of edits or text crashes the viewer (spec §12).
- `packages/core/test/kind-lanes.test.js` — kinds that link in order each get a lane in rows and a plane in space. The
  View menu says so, and its switch turns it off (editor spec §68, layout_kind_lanes).
- `packages/core/test/progressive-draw.test.js` — a massive graph is drawn in steps. The overview comes first. Then
  come the chosen group and those nearest the middle, each added to the picture (editor spec §53, scale_progressive).
- `packages/core/test/level-of-detail.test.js` — a massive graph opens as one box for each group. A group shows its
  things only when zoomed in on. The screen is never given more than it holds (scale_level_of_detail).
- `packages/core/test/mesh-work-in-engine.test.js` — pathfinding, centroids, altitude and transitions are the engine's.
- `packages/core/test/mesh-surfaces.test.js` — Obsidian, VS Code and the web view read the same notes, so an edit shows in all three.
  No host computes them itself (editor spec §27, mesh_work_in_engine).
- `packages/core/test/no-upkeep.test.js` — an edit refreshes a note's clusters, centroids, groups and lens lists. The
  person takes no step (editor spec §31, derivations_need_no_upkeep).
- `packages/core/test/bidi-labels.test.js` — each element of the display layer that shows the person's own names,
  labels or values is read from its first strong letter. It is set apart from the words around it
  (`unicode-bidi: plaintext`). Each is an element the layer makes (editor spec §42, bidi_labels).
  - In the drawing and every picture of it, a label with a right-to-left letter is wrapped in Unicode's first strong
    isolate. The Python library does the same to the same cases (`bidi-label-cases.json`).
  - It stays partial until a real browser checks that each label fits its box.
- `packages/core/test/words-files.test.js` — the translation files in `packages/core/translations/` (editor spec §42,
  translations_as_files). Each is named by its language tag and holds the source's keys and placeholders. Each is
  listed for the core. The folder's README.md is the translators' guide.
- `packages/core/test/words-in-code.test.js` — the display layer's code holds no words a person reads: each comes
  from the catalogue by key (editor spec §42, words_catalogue). The few kept are listed, each with why.
- `packages/core/test/locale-bytes.test.js` — the editor writes the same bytes in every setting. No language, locale
  or direction changes an edit, an export's data or the layout source (editor spec §42, locale_never_changes_bytes).

## The core's views

- `packages/core/test/multi-member-drawn.test.js` — a thing in two clusters is drawn in each region, with the same
  marker. So is a part with two wholes (editor spec §36, multi_member_drawn).
- `packages/core/test/views-as-scaffolds.test.js` — a view says what a complete version needs. Each field a thing lacks
  is drawn as a prompt, and filling one writes it into the graph (editor spec §36, views_as_scaffolds).
- `packages/core/test/display.test.js` — styled views and paths change only what they choose, and keep the locked hues, contrast and legend (editor spec §7).
- `packages/core/test/view-parity.test.js` — every view of the shared table (`python/graph_spec/tests/view_cases.json`)
  is found in its note, read, and returns the things the table gives. Every query outside the view profile gets the
  table's refusal (editor spec §7, views_agree_with_grafeo).
- `packages/core/test/views-across.test.js` — a view saved as shown is written in the style graph, never the data, and reopens the same (editor spec §7).
- `packages/core/test/large-drawing.test.js` — a graph of more than 300 things is laid out the quick way, in one
  direction. It is still drawn whole by the engine, and a person's routing still wins (editor spec §11,
  large_drawn_quick).
- `packages/core/test/edge-cases.test.js` — empty, broken and oversized inputs each give a stated result, never a blank or a crash (spec §9).
- `packages/core/test/edits.test.js` — every edit from the pane round-trips; locking writes a schema the checks pass.
- `packages/core/test/proposals-checked.test.js` — a proposal is run through the graph spec's own change-set check, and
  the answer shown.
  - Every proposal written, removals and decisions included, passes it.
  - A removal is a DELETE, a change of a value a SET, and a change's id is derived from its statement.
  - A decision is kept as a Decision in the note's judgement graph, and a rejected addition leaves the live graph.
  - The decider is the settings' text as typed or "you" (editor spec §17, proposals_checked, decider_named; the graph
    spec's cs-rejected-out).

## The core: undo, copies and exports

- `packages/core/test/undo-over-theirs.test.js` — undo never undoes over a change another program, a sync or another
  pane made to the block. The history starts again from the note as it now is, and Undo and Redo say why there is
  nothing to take back. A change elsewhere in the note leaves undo working (editor spec §9, undo_never_over_theirs;
  §26, cc_undo_safe).
- `packages/core/test/undo-one-block.test.js` — undo stays in its block. Switching the pane to another block starts
  that block's own history, so Undo and Redo never write one block's text into another. A reason that held for the
  block left is not given for the one chosen (editor spec §9, undo_stays_in_its_block).
- `packages/core/test/block-copy.test.js` — the block followed, not its copy. Another program may paste a copy of the
  open block and then edit the original. The session keeps to the original, so Undo never reverts the copy while their
  edit survives. A copy it cannot tell from the block stops it. Every write and Undo is refused, saying so, until a
  block is chosen again (editor spec §9, block_followed_not_its_copy).
- `packages/core/test/notes-export.test.js` — each data export keeps the `///` notes where its format has comments: a
  GQL block's `///` lines and GraphML's XML comments. They are read back as written however hostile. CSV has no
  comments, so it leaves them out. The text an engine is given keeps them too (editor spec §24, note_standard).
- `packages/core/test/imports.test.js` — the core imports no host.
- `packages/core/test/hosts-boundary.test.js` — the host-side modules of the core (`src/hosts/`, reached as
  `@thoughtknot/core/hosts/<module>`) are imported by no gate or other core module. They are not exported by the entry,
  and import only types from the core (editor spec §19, model_ceiling).

## The Claude Code editor: build, server and page

- `packages/claude-code/test/build.test.mjs` — the build writes the mod's hooks bundle, with no WebAssembly engine, and a render script that draws.
- `packages/claude-code/test/editor-threats.test.js` — the browser editor's server against its threat model, each
  threat tried on the running server (editor spec §26, test_cc_threats). The threats are:
  - loopback only, wrong Host, wrong Origin, no token or a wrong one, a token in the address, and a stale write;
  - an oversized body, the content security policy, no CORS, and a path escape on the test-only note route;
  - the server's own limits, no outgoing request, and the idle stop.
- `packages/claude-code/test/editor-threats-process.test.js` — the same threat model tried on the server's process: no
  argument taken, and the token handed over once and kept nowhere. There is no start when orphaned, and every way the
  process stops is tried (editor spec §26, test_cc_threats).
- `packages/claude-code/test/editor-export.test.js` — the browser editor's export written by the server (editor spec
  §26, test_cc_export). Only new files go in the export folder, never over a file or through a link. A name is only a
  name, and an export is written whole or not at all. Every change checks the token, Host, Origin and body limit.

## The Claude Code editor: its page

- `packages/claude-code/test/editor-page.test.js` — the browser editor's page (editor spec §26; test_cc_page). It
  covers cc_core_only (C4), accessibility and motion (C8), the host shell (C5) and editing (C9).
  - Accessibility and motion (C8, `editor-page-access.js`): the skip link, and menus walked by the arrow keys. It checks
    an accessible name on every control, the keyboard kept in place across a redraw, and a visible focus. Reduced
    motion stills the page, and the text version is present and kept in step with the note.
  - The host shell (C5): one Markdown renderer with raw HTML off, and text shown as text. Layout runs in a same-origin
    worker. It covers the theme, icons as image files, offline, and settings read only.
  - The page takes everything from the core and the display layer shared with the Obsidian host
    (`packages/core/src/display/`), and imports no Obsidian code. This is tried on the layer's imports and on a bundle
    of the page's side. It is also tried on the layer run through a plain host with no Obsidian in the process.
  - Editing (C9, `editor-page-editing.js`, over `editor-page-live.js`): the page as built is run in a DOM against the
    real server and a vault on disk. The page opens the note with the drawing inline, its details and the edit pane of
    the Obsidian host. That pane is the layer's `display/editor/`, and the plugin keeps only its vault note.
  - The drawing's colours are set through the CSSOM, so no style attribute or sheet reaches the parser under the policy
    as it was. What is typed is written by the server and drawn again. Undo and Redo work.
  - A block changed on disk meanwhile is never overwritten, and is kept as a draft. Undo never goes over another
    program's change. Nothing is written while the note is above the gate.

## The Claude Code editor: parity with Obsidian

- `packages/claude-code/test/editor-parity.test.js` — the same edit writes the same bytes in the browser editor's
  session and in Obsidian's edit pane, Undo and Redo too. So does a decision on a proposal, through the page's card
  against Obsidian's strip. It runs over shared cases (editor spec §26, cc_same_bytes; test_cc_parity).
  - C9 adds (`editor-parity-page.js`) every kind of edit the pane makes. Each is made on the page as built and in the
    plugin's pane, byte for byte.
  - The edits are typing, a fix, a suggestion, Undo and Redo, and Lock the graph. They include an estimated link's
    quick fix from the drawing, and another block chosen. The note changed elsewhere first, and a stale write, are
    tried too.

## The Claude Code editor: the mod and its gates

- `packages/claude-code/test/editor-mod.test.js` — `/graph edit` from the mod, tried on the launcher over real server
  processes started as the host starts one. The address is handed to the pane alone and never to the conversation. A
  start that fails is said plainly, and there is one server for each session. The server is stopped by the session
  ending, `/graph stop` and its own end (editor spec §26; test_cc_mod, partial until C7 adds its cases; C3's gate cases
  are in it).
- `packages/claude-code/test/editor-mod-matrix-links.test.js` — a matrix note whose real path is outside the vault is
  not read. That holds whether it is by a link on the note or on a folder above it. A note the host cannot place is not
  read either, and the server is handed the same refusal. The real path is asked of a host that can only start a
  process (editor spec §26, cc_classified_asks; §19, model_ceiling).
- `packages/claude-code/test/editor-mod-matrix.test.js` — Claude's level from the destination matrix, in the mod and
  the server. The mod reads the matrix note from inside the vault only. It hands the server the row, switches, class
  names and rows. Both gates give the same answer on the same inputs. They fail closed alike when the note cannot be
  read (editor spec §26, cc_classified_asks; §19, model_ceiling).

## The Claude Code editor: Claude's proposals and the gates

- `packages/claude-code/test/editor-mod-claude.test.js` — Claude is the only AI the browser editor offers. What it
  changes in the note open in the pane reaches it as a proposal through the mod. That is a checked change set the user
  accepts or rejects. The store writes it whole and in turn. It applies only on accept, and its key is good for that
  one route. It is refused for a note above its clearance (editor spec §26; cc_claude_only,
  cc_claude_proposes).
- `packages/claude-code/test/editor-mod-claude-tools.test.js` — `guardOpenNote` refuses Claude's own Write, Edit,
  NotebookEdit and Bash calls on the note open in the editor. The refusal points to the propose tool. So a change
  to that note is never applied by Claude's own tools while `guardOpenNote` holds. A note that carries instructions
  gets a proposal that waits on the card, never a change (cc_claude_proposes; risks AI-1, AI-3).
- `packages/claude-code/test/editor-mod-claude-limits.test.js` — what the security review of #483 found. A proposal
  cannot grow the note without limit: its size, a value's and a reason's length, and how many wait. The proposer's key
  is passed on standard input and not in the environment. Claude's own text never carries the user's yes, and what it
  says it read is one line (editor spec §26; cc_claude_proposes).
- `packages/claude-code/test/editor-mod-gate.test.js` — the gate's hardening from the review of #475, tried on the
  launcher. Only the person typing in the composer can say yes. The yes goes to the server for the content it was given
  about (editor spec §26; cc_classified_asks).
- `packages/claude-code/test/editor-mod-support.test.js` — the page the build makes is there before the editor tests
  start a server. In a fresh checkout the suite runs before `npm run build` and beside the build's own test. A server
  never refuses to start there for want of the page (editor spec §26).
- `packages/claude-code/test/editor-store-gate.test.js` — the gate inside the server's note store, asked before every
  send. It covers a read, a draft, the change stream and a stale write's answer. A yes does not carry over to changed
  content (editor spec §26; cc_classified_asks, cc_credential_never).

## The Obsidian plugin

- `packages/obsidian/test/accessibility.test.js` — contrast in both themes, and a keyboard path for every action.
- `packages/obsidian/test/focus-support.test.js` — the Focus support view preset (editor spec §69). The rest is
  blurred, not hidden, and a trail of picks is kept to go back along (view_focus_support).
- `packages/obsidian/test/reading-support.test.js` — the Reading support view preset (editor spec §69). It gives short
  labels, plain spaced words, the full words read aloud, and the outline on O (view_reading_support).
- `packages/obsidian/test/matrix-send.test.js` — the send dialog and the destination matrix note. The note is read each
  time what will be sent is shown. A note that cannot be read refuses plainly, with nothing ready to send. A read that
  finishes after the model or the question changed makes nothing ready (editor spec §19, model_ceiling).
- `packages/obsidian/test/notes-shown.test.js` — a note shown in a thing's or link's details as Markdown through the
  one renderer, raw HTML never rendered. A setting draws notes as callouts joined by a dashed line. It is off by
  default, over a layout the same as without them. The same note's first paragraph shows in the quick-info tooltip
  (editor spec §24, note_shown, note_callouts).
- `packages/obsidian/test/details-open.test.js` — the details panel kept open by a setting, off by default, in a card
  and in the pane. It shows the graph's summary while nothing is chosen. It sits beside the drawing, and below it where
  the card is narrow (editor spec §24, details_always_visible, details_narrow).
- `packages/obsidian/test/build.test.mjs` — the build writes the files the plugin is installed from.

## The Obsidian plugin: the View menu and views

- `test/orientation-cues.test.js` — every projection keeps the cues to where the person is (editor spec §25,
  orientation_cues; ethos rule r_cues). In 2D the mini-map and the marked selection, also laid out again. The rest
  glide there round the selected thing, which stays put. In 2.5D and 3D the picked card or ball, marked and named.
- `packages/obsidian/test/detail-ladder.test.js` — the View menu's ladder of detail, Overview, Groups and All, in the
  built plugin. A step turns the switches under it (editor spec §53, cluster_detail_ladder).
- `packages/obsidian/test/layout-said.test.js` — the View menu says how the drawing was laid out, and why. It says
  where its loose things went. In the built plugin (editor spec §68, layout_pick_said).
- `packages/obsidian/test/cluster-open.test.js` — a folded group opened by zooming in on it, or picked again in 3D, in
  the built plugin (editor spec §53, cluster_opens).
- `packages/obsidian/test/cluster-fold-back.test.js` — a group opened from its box folds back by its button. Its name
  zooms to it. In the built plugin (editor spec §53, cluster_fold_back).
- `packages/obsidian/test/view-types.test.js` — the card's Views list offers each view drawn as marks. A view chosen is
  saved in the style graph and drawn (editor spec §36, view_types_offered).
- `packages/obsidian/test/remote-images.test.js` — an image from outside the vault, in a thing's details or a note
  embedded there, is a link with a Load image button. Only pressing it loads that image (editor spec §18,
  remote_images_asked).
- `packages/obsidian/test/database.test.js` — Import offers the vault's SQLite files, with nothing to set up. It reads
  one only when pressed, on desktop and mobile, with no network. It writes the rows into the note as text that keeps no
  live link (editor spec §20, db_import_on_request; §21, settings_db_connections).
- `packages/obsidian/test/inline.test.js` — editing in place in the drawing's card.
- `packages/obsidian/test/views-many.test.js` — several views of one graph, in one note or in several. Each is drawn
  from the one data set where it is written, and none copies it. A view of a graph written in another note says which
  and opens it (editor spec §7, many_views_one_data, view_of_another_note).
- `packages/obsidian/test/views-over-one-graph.test.js` — two views of one graph, stacked, each drawn as its own type.
  An edit to the graph shows in both. A type chosen in one is saved for it alone (editor spec §36, views_over_one_graph).

## The Obsidian plugin: the process debugger

- `packages/obsidian/test/process-debugger.test.js` — the process debugger in a drawing's walk strip (editor spec
  §35). It spans `process-debug.ts` and the core's `test-runs.ts`.
- `packages/obsidian/test/playback-controller.test.js` — the player under the debugger, autoplay or by hand (§35). It
  spans `process-debug.ts` and the core's `playback.ts`.

## The Obsidian plugin: personal profiles

- `packages/obsidian/test/pacing.test.js` — a path's pace worked out from the session, shown with its reason and kept
  as usual in one tap. The profile itself changes only on approval (editor spec §39, pacing_automatic).
- `packages/obsidian/test/adapted-view.test.js` — a shared view adapted for its viewer alone, its label, and show as
  shared for the session (editor spec §39, adapted_for_viewer).

## The graph format library

- `packages/graph-spec/test/characterisation.test.mjs` — the library gives the answers recorded before it moved here.
- `packages/graph-spec/test/changesets.test.mjs` — a change set's author is the session that sent it, never the name in
  its header (editor spec §51, spec_author_from_session; GS4). A header naming anyone else fails, and the set is checked
  as the session's.
- `packages/graph-spec/test/limits.test.mjs` — the reader, the check and a join stop at stated limits. Each limit is on
  size, nesting or join size, with a clear refusal (editor spec §51, spec_read_limits; GS4; `limit-cases.json`).
- `packages/graph-spec/test/guards.test.mjs` — a guard is read in the guard language, `requirements/guard-language.md`,
  and anything else is refused (editor spec §51, spec_guard_language; GS4; `guard-cases.json`).
- `packages/graph-spec/test/serving.test.mjs` — a secret is found by its shape in any value of a graph. The editor finds
  it the same way (editor spec §51, spec_secrets_and_fences; GS4; `secret-cases.json`).
- `packages/graph-spec/test/hashes.test.mjs` — every hash names its algorithm, as `requirements/hashes.md` says, and a
  bare one is refused. A judgement or a serving edited after its hash was made is reported (editor spec §51,
  spec_hashes_named; GS4; `hash-cases.json`).
- `packages/graph-spec/test/commas.test.mjs` — both readers read a missing comma the same way, and write it into the same corrected text.
- `packages/graph-spec/test/escapes.test.mjs` — both readers read quoted text's escapes as GQL does. They refuse one GQL
  does not name, with the fix that doubles the backslash, and quote a text alike (req:3.gql-escapes; one table,
  `escape-cases.json`).
- `packages/graph-spec/test/problem-codes.test.mjs` — every problem the JavaScript reader raises passes a stable code
  from `src/reader/problem-codes.json`, with that code's message and fix. The blocks of `problem-code-cases.json` are
  refused with their codes (editor spec §42, problem_codes).
- `packages/graph-spec/test/format-version.test.mjs` — both readers read a block in their own format or none named.
  They refuse a newer major with GN106 (format_version_named; one table, `format-version-cases.json`).
- `packages/graph-spec/test/mesh-parity.test.mjs` — every shared mesh case, joins included, gives the bytes whose hash
  `mesh-parity-cases.json` holds (mesh_engine_parity).
- `packages/graph-spec/test/join-every-author.test.mjs` — identical edits from any author join alike. A text merge that
  picks a value leaves the dispute for a person (same_join_every_author; `join-every-author-cases.json`).
- `packages/graph-spec/test/process-core.test.mjs` — the process core and its runs, across `src/process/core.js` and
  `runs.js`. It covers eight kinds, transitions, guards as data, the run log and nested machines (editor spec §34;
  `process-core-cases.json`).
- `packages/graph-spec/test/mesh-one-format.test.mjs` — a block of schema and inserts is read once. The lens
  rules answer about its things and its schema alike (mesh_one_format; `mesh-one-format-cases.json`).
- `packages/graph-spec/test/layout.test.mjs` — the layout source is byte-identical to the Python library's.
- `packages/graph-spec/test/lint-parity.test.mjs` — the JavaScript dialect linter matches the Python one.

## The Python library

- `python/graph_spec/tests/test_changeset_header.py` — a change set's first line is read as the reader reads a
  block's, in the engine's copy and the rules'. Lines end at LF only, and whitespace is GQL's set.
- `python/graph_spec/tests/test_engine_gets_corrected.py` — every route to the engine gives Grafeo the reader's
  corrected text. So a link type without its colon is accepted by both parsers. The text keeps the block's own lines
  (req:3.engine-gets-corrected, req:3.engine-text-keeps-lines).
- `python/graph_spec/tests/test_engine_gets_commas.py` — every route to the engine gives Grafeo the reader's corrected
  text, with each missing comma written in. It goes at the end of the code on its line. So a block missing one loads as
  the profile parser reads it, and no line is added (req:3.engine-gets-commas, req:3.engine-text-keeps-lines).
- `python/graph_spec/tests/test_engine_text_comments.py` — every route to the engine gives Grafeo each whole-line
  comment as a `/* */` comment on its own line. A `*/` in its text is broken up, and a line ends at LF only
  (req:3.engine-keeps-comments, req:3.engine-text-keeps-lines).
- `python/graph_spec/tests/test_problem_codes.py` — every problem the Python reader raises passes the stable code
  `problem-codes.json` gives it, the same as the JavaScript reader's. The blocks of `problem-code-cases.json` are
  refused with the same codes (editor spec §42, problem_codes).
- `python/graph_spec/tests/test_format_version.py` — the Python reader reads the cases of `format-version-cases.json`
  as the JavaScript reader does, and refuses a newer major format with GN106 (format_version_named).
- `python/graph_spec/tests/test_mesh_parity.py` — every shared mesh case gives the same bytes as the JavaScript
  library, by the hashes of `mesh-parity-cases.json` (mesh_engine_parity).
- `python/graph_spec/tests/test_join_every_author.py` — the Python library gives the answers of
  `join-every-author-cases.json`, whoever made the edits (same_join_every_author).
- `python/graph_spec/tests/test_process_core.py` — the Python library's `core` and `runs` give the answers of
  `process-core-cases.json` (editor spec §34).
- `python/graph_spec/tests/test_mesh_one_format.py` — the Python library reads the block of `mesh-one-format-cases.json`
  once and its lens rules give the same buckets (mesh_one_format).
- `python/graph_spec/tests/test_drawing_problem_codes.py` — each problem the Python drawing reader finds in a note or
  a style graph has a stable code. It comes from `packages/core/src/drawing-problem-codes.json` or the reader's own
  table. The notes of `drawing-problem-cases.json` give the same codes as the core gives them (editor spec §42, problem_codes).
- `python/graph_spec/tests/test_escapes.py` — the Python reader answers `escape-cases.json` as the JavaScript one does, and what the engine writes for Grafeo keeps a text's escapes (req:3.gql-escapes).
## The Python library: ids, limits and layout

- `python/graph_spec/tests/test_id_once_engine.py` — every route to the engine reads the block with the reader first.
  So no id reaches it twice in a graph (req:3.engine-reads-first, req:3.id-once).
- `python/graph_spec/tests/test_ids_engine.py` — every route to the engine refuses a SET of a node's id. It also
  refuses a node id that is not text, read by the reader first (req:3.set-keeps-id, req:3.id-is-text).
- `python/graph_spec/tests/test_guard_language.py` — every Python reader of a guard answers `guard-cases.json` as the
  JavaScript one does (editor spec §51, spec_guard_language).
- `python/graph_spec/tests/test_serving_fences.py` — the view server refuses a secret and a graph not granted. No graph
  text can close its fence (editor spec §51, spec_secrets_and_fences).
- `python/graph_spec/tests/test_limits.py` — the Python library stops at the limits of `limit-cases.json`, as the
  JavaScript one does (editor spec §51, spec_read_limits).
- `python/graph_spec/tests/test_hashes_named.py` — the Python library and Grafeo answer `hash-cases.json` as the
  JavaScript one does. Both refuse a change set made against a bare state (editor spec §51, spec_hashes_named).
- `python/graph_spec/tests/test_layout_source.py` — the Graphviz source is the one written before the move.
- `python/graph_spec/tests/test_licences.py` — every Python package carries an allowed licence.
- `python/graph_spec/tests/test_parity.py` — the Python library gives the JavaScript library's answers.
- `python/graph_spec/tests/test_reader_agrees_with_grafeo.py` — the reader and its plain rules give Grafeo's answers, Grafeo being the reference engine and a test dependency only (req:17.engine-agreement).
- `python/graph_spec/tests/test_view_parity.py` — Grafeo, running each view of `view_cases.json` as written, returns the
  things the core returns (editor spec §7, views_agree_with_grafeo). It is given a fixed list of GQL's and Cypher's
  words. It refuses as a name and as a kind exactly the words the core keeps from them.
- `python/graph_spec/tests/test_settings.py` — what a host sets after importing the library.

## The libraries' examples

- `test/library-examples.test.js` — the libraries' runnable examples, `examples/js` and `examples/python`, read and
  check a block with every rule passing (API-12). CI's `examples` job runs each one from the release archive's layout.

## Colours and direction

- `test/print.test.js` — a printed note (editor spec §44, print_ready). Each graph is drawn whole, in the host's
  light print colours, with its legends and without the card's controls.
- `test/colour-alone.test.js` — no meaning is carried by colour alone (editor spec §44, colour_never_alone). An error
  is told from a warning by its sign and its line as well as its colour. Each colour of a view's looks has a numbered
  tag. It is on its boxes, its links and the legend, on the card and in an export.
- `test/forced-colours.test.js` — every view in forced colours and with more contrast asked for (editor spec §44,
  forced_colours).
  - Each sheet gives every colour token its system colour (`FORCED_TOKEN_COLOURS`). For more contrast, secondary text
    and lines take the full text colour (`MORE_CONTRAST_TOKENS`).
  - The drawing draws each box, line and word in the system's colours, in the plugin and as the page's image.
  - Nothing is shown by a shadow alone, and no focus ring is hidden without another way of showing focus. Only the
    rules listed keep their own colours.
- `test/host-adapters.test.js` — every host's real adapter passes the one host contract of
  `packages/core/src/display/host-contract.ts` (editor spec §43, hosts_pass_contract). Obsidian's is built as the plugin
  builds it, and the browser page's runs in a DOM. It is partial until the standalone app and VS Code join it.
- `test/storage-contract.test.js` — every note storage backend passes the one storage contract of
  `packages/core/src/storage-contract.ts` (editor spec §41, storage_contract). The backends are an Obsidian vault, a
  plain folder and a VS Code workspace, and memory. A new backend joins the list in this file. Encryption, sync and
  history plug in as layers (`layered` in `note-storage.ts`), and a backend with layers on passes too.
- `test/sample-plugin.test.js` — the sample plug-in outside the packages, `examples/sample-plugin`, runs as a host
  runs one it did not ship (API-10). It loads in a real thread with no network, and each thing it adds passes its
  point's contract over the port.
- `test/rtl.test.js` — the style sheets say sides by reading direction (`margin-inline-start`, `inset-inline-end`,
  `text-align: start`), so the interface mirrors in a right-to-left language. The only rules on a physical side are
  those placed at a point measured on the screen, each listed with why. Each view's root reads in the host's direction
  (`readInHostDirection`), and the drawing keeps the screen's (editor spec §42, rtl_mirrors).

## Languages, tokens and text size

- `test/pseudo-locales.test.js` — every view of every host, drawn in the test languages `en-XA` and `ar-XB`.
  - `en-XA` is accented and 40 per cent longer, and `ar-XB` is read right to left.
  - No catalogue word is left in UK English, and each view reads in the language's direction. No part is set on a
    physical side but those placed at a measured point.
  - The words the code still says itself, not yet in the catalogue, may not grow in number.
  - No box that holds words has a fixed width or clips them, unless listed with why.
  - Editor spec §42, pseudo_locales_checked. It is partial, as overlap needs a layout: RELEASING.md, AX-20 and AX-21.
- `test/theme-tokens.test.js` — the interface is styled through the design tokens alone (editor spec §44,
  ui_theme_tokens).
  - Every rule of `styles.css` and the browser page's `page.css` reads a `--gn-*` token (`THEME_TOKENS`) or an
    element's own measure, never a host's variable.
  - Each sheet maps its host's theme to every token in one block. Obsidian's does so by the core's table
    (`obsidianTokenValue`), and the page's from the theme it is built with.
  - Every animation takes its time and easing from a motion token.
  - No token takes a name the drawing's own colours use.
- `test/text-scaling.test.js` — text scales to 200 per cent with nothing lost (editor spec §44, text_scaling). Every
  text of the interface is sized by a token or its parent's size, never in pixels or points. The drawing's own marks
  are aside, as they scale with its zoom. No line height is fixed, and no box that holds text has a fixed height. The
  browser page's theme sizes its text in rem.

## The architecture's layers and areas

- `test/layers.test.js` — each layer imports only the layers below it, as `requirements/architecture.gql` says. It
  reads every import of the shipped code (editor spec §43, layers_checked; `node scripts/layers.mjs`).
- `test/code-structure.test.js` — each shipped file of a part with areas sits in one area of `requirements/architecture.gql`.
  No area is over its ceiling, and the Architecture page draws the areas (editor spec §43, structure_checked).

## Test tooling and the build status's parts

- `test/import-graph.test.js` — the import graph, and the tests that reach a changed file through it. It covers imports
  by path and by package name, and a file or folder a test names to build or walk. It also covers how
  `npm run test:changed` picks them (editor spec §13, affected_tests_by_imports).
- `test/cheap-checks.test.js` — the quiet test run, running only a change's tests and the search ignore file.
- `test/agents-guide.test.js` — the short AI guide, AGENTS.md, stays slim, and its handbook holds the detail.
- `test/build-status.test.js` — the build status's pure part. It covers the requirements a pull request moves, found
  from the tests it newly marks written. It also covers the stage an event gives, which value may replace which, and the
  comment and the annotations.
- `test/build-status-gh.test.js` — the build status's calls to GitHub, through in-memory stand-ins for `gh`. They cover
  a pull request, the requirements file at a ref and its size, CI's run and the releases. They also cover the pull
  requests merged in a span, the one comment, leaving it on a locked conversation, and the two tokens kept apart.
- `test/build-status-seed.test.js` — the first values the mirror gives an item that has none. They are Released,
  Merged, In PR or Not started, with the built-in Status to match. A draft release does not count. It checks the tally
  `--check` prints, and that a value already set is never overwritten (only Todo replaced).
- `test/build-status-gh-lock.test.js` — leaving the comment on a conversation that may be locked. A pull request is
  unlocked only when its own `locked` field is true; a refusal that says blocked unlocks nothing. The lock is taken up
  again with the repository's retry, or the pull request is said to be left unlocked.
- `test/build-status-gh-lists.test.js` — the open pull requests and those merged in a span, of this repository's own before any cap, past a crowd of fork pull requests.
- `test/build-status-board.test.js` — the build status's project board: each item's Build status and Status, and
  setting either. The issues are read with the workflow's token, and the project with the project token alone. Every
  trouble that is the board's own is tried.

## The build status: runs, claims and workflows

- `test/build-status-run.test.js` — the build status event by event.
  - The events are a pull request opened, CI's checks failing and passing, its merge and closing, and a release.
  - It covers the pull requests it leaves alone: a fork, a stale one, one merged elsewhere. It covers a very large one
    too.
  - A project token that is missing, expired (401) or refused warns and never fails.
- `test/build-status-env.test.js` — the build status run whole from a workflow's environment. It covers the event file,
  the two tokens each to its own runner, the exit code, and a requirements file too large to read.
- `test/build-status-started.test.js` — Started on: the day a pull request of this repository first took a requirement
  on, by its copy or its Requirements line.
  - It is set once. It is kept when the pull request merges, or while another pull request holds the item.
  - It is cleared when the pull request closes unmerged and nothing else holds it.
  - The mirror's seed sets the earliest such day where none is. It clears it only for an item Not started. It keeps it
    for one proved, `part` on main (1 of 3 tests written and merged), or In PR or later.
- `test/build-status-claims.test.js` — the built-in Status field (Todo, In Progress, Done), and an item two pull
  requests hold. It also covers the `Requirements:` line of a draft pull request, the only part of its untrusted
  description that is read.
- `test/build-status-comments.test.js` — the comments after a pull request is closed and locked. They are the Merged
  comment, and the Released comment a release leaves on each pull request it moves. It is left by unlocking, commenting
  and locking again, and every way that can fail is tried.
- `test/build-status-workflow.test.js` — the two build status workflows. They are woken only by the checks of a pull
  request, a push to main and a release. The project secret is given only to the script on main. No event text goes in
  a command line, and they hold least privilege.

## The VS Code extension's nightly file

- `test/vscode-release.test.js` — each nightly attaches the VS Code extension as a `.vsix` to install (spec §41,
  nightly_prerelease). `scripts/vscode-release.mjs` packs it, and the test reads a real one back.

## The library's release

- `test/lib-release.test.js` — each release publishes the library on GitHub, never on npm (spec §41, lib_github_release).
  `scripts/library-release.mjs` builds two packages, graph-spec and the core, and the test installs both with no
  registry and runs a program on them.
  - `scripts/changelog.mjs` writes the release notes: the pull requests merged since the last release, and a Library
    changes section. That section says what the interface added or broke, and the version rule (version_promise_told).
  - `--check` refuses notes without it. The release runs it before it drafts, and the release check tries it first.
- `test/lib-public-api.test.js` — the library's public interface (spec §41, lib_public_api). It is declared in
  `public-api.json`, which `node scripts/public-api.mjs --update` writes. A break since the last release fails
  unless the package takes a new major version. Before 1.0.0 that is the leftmost part that is not 0, such as 0.8.0.

## The graph spec

- `test/graph-spec-text.test.js` — the graph spec's text is in `requirements/graph-spec.gql` (spec §13,
  graph_spec_in_repo; ARCH-11). Every § either library cites is one of its sections; the editor's own say "editor spec".
- `test/graph-spec-index.test.js` — the graph spec file is true to itself (spec §51, spec_index_true; GS1): its counts,
  the paths it names, and no pending rule that a test proves.
- `test/graph-spec-proved.test.js` — every graph-spec rule a test here cites by its id counts as proved (spec §51,
  spec_rules_proved; GS1). A 'general' proof or a case kept outside the repository counts for nothing.
  `quality/graph-spec-unproved.json` lists the rest, and it only shrinks: `node scripts/graph-spec-proved.mjs --update`.
  A rule also counts as proved when its proof names a test in a conformance case kept here.
- `python/graph_spec/tests/test_conformance_suite.py` — the graph spec's conformance suite passes on the code here
  (spec §51, spec_conformance_in_repo; GS1). The suite is in `python/graph_spec/conformance/`.

## The repository, its community files and device checks

- `test/classification.test.js` — the content check refuses confidential or personal files.
- `test/conventions.test.js` — the conventions on this page.
- `test/walkthrough-record.test.js` — each stable release keeps a record of the accessibility walk-through (spec §11,
  walkthrough_recorded; UX-1). `scripts/walkthrough-record.mjs --new` writes an empty one to fill in. The release and
  its dry run fail until every check is ticked, or given its reason, in every host and theme.
- `test/community-files.test.js` — the code of conduct says how to report a problem in private. `TRADEMARKS.md` keeps
  the name for the original. CONTRIBUTING.md and the pull request template ask for every commit to be signed off
  (editor spec §13, community_files). `SECURITY.md` names the supported versions, a private way to report and a
  reply time (security_policy).
## Community rules, Apple's terms and the working group

- `test/apple-terms.test.js` — the rules we keep for Apple's developer terms (spec §41, apple_terms;
  `docs/apple-terms.md`). Nothing people read claims that Apple vouches for ThoughtKnot. `TRADEMARKS.md` names Apple's
  marks as Apple's. The app id stays under thoughtknot.app, and no workflow holds an App Store key.
- `test/working-group.test.js` — `docs/agents/ROLES.md` gives Roger, Claude, Antigravity and Grok their work,
  labels and branches, and repeats the rules each keeps. `AGENTS.md` points to it.
- `test/desktop-build.test.js` — the desktop installers are signed only where every key is set. A pull request build
  never gets a key (editor spec §41, app_signed).
- `test/device-check-notes.test.js` — the device checklist numbers every item (editor spec §3, tried first in a test
  vault).
  - The test vault holds one note for each item after Before in `Device checks/`. The note's checklist line is the
    item's words.
  - Each note's graph blocks read as it says they do, by the repository's reader and checker, and `parseView` for a
    view.
  - The index lists the notes in order.
- `test/device-check-quotes.test.js` — what a device check note quotes from Obsidian's screen is computed from the
  note's own graph blocks with the real functions, and matches exactly. The quotes are a read-back, a label, the tap
  text of an estimate and a box's details. They are also an export's footer and file name, and the conversion notice.
  The notes' generator scripts and filler set up the case they describe (editor spec §3).
- `test/engine-version.test.js` — the Graphviz version is read from the engine, named in the notices, and checked against published advisories.
- `test/ethos.test.js` — the project's ethos (`requirements/ethos.gql`). Every rule names the requirements that check
  it, or says a person checks it or nothing does yet, and only requirements that exist. Each fault is named. The wiki's
  Ethos page shows each principle and each rule's state (editor spec §41, ethos_checked).
- `test/fixed-sleeps.test.js` — no new fixed sleep in the tests. An awaited `wait(20)` or the like outside a polling
  loop is held, file by file, to the allowance in `test/fixed-sleeps.json`. That allowance only goes down
  (`node scripts/fixed-sleeps.mjs --tighten`).

## The GitHub mirror of the requirements

- `test/github-project.test.js` — the GitHub mirror of the requirements as a person runs it. The real workstreams file
  puts every requirement of slices 3 and 4 in exactly one workstream. It may name ids a later copy brings. The command
  is a dry run by default, with no network call.
- `test/github-project-desired.test.js` — that mirror's desired state. It covers the first clause of a rule, and each
  issue's title, body, labels and open or closed. It also covers the marker, and the project's fields and options.
- `test/github-project-gh.test.js` — that mirror applied through an in-memory stand-in for `gh`. It covers a first
  apply, a second that changes nothing, and drift put right. A removed requirement is labelled and closed, and nothing
  is ever deleted.
- `test/github-project-gh-owner.test.js` — that mirror's project found, made and filled through GraphQL by the owner's
  login. The runner used is one for which every `gh project` verb fails with "unknown owner type". An owner or a list
  that is not there is an error naming the owner, never no projects.
- `test/no-gh-project-verb.test.js` — no script under `scripts/` builds a `gh project …` argument list or names
  `item-edit`. gh checks scopes `PROJECT_TOKEN` lacks, so item values are set and cleared by GraphQL.
- `test/github-project-gh-safety.test.js` — that mirror's care. Every call names its repository or owner, and gh must
  point at the origin's repository. Mutating calls are paced and retried once on a secondary rate limit. A list that hit
  its cap is refused.

## The GitHub mirror: retries, waves and fields

- `test/github-project-retry.test.js` — that mirror's patience.
  - A timeout, a reset connection, a 502, 503 or 504, or "something went wrong" is waited out 5, 15 and 45 seconds and
    tried again. A fourth failure stops the run.
  - A create that went through before the failure is never made twice. Only an issue the signed-in login wrote is
    taken up again.
  - The worst case is 65 seconds of waiting (5 + 15 + 45) for one call. The same again is spent on each look at GitHub
    before a retried create, before the run stops with gh's words.
- `test/github-project-waves.test.js` — that mirror's waves plan, `requirements/waves.json`, read and refused.
  - Each requirement's Wave and Order are derived from it, and a reordered plan moves Order.
  - It covers the iterations of the Wave field, and the tally `--check` prints. That tally warns of each requirement in
    no wave that is not proved.
  - The real plan holds every requirement of slices 3 to 10 not yet proved.
- `test/github-project-fields.test.js` — that mirror's fields that are not a single choice, each derived.
  - Closed on is set on close from the issue's closedAt, for one closed before the field existed too. It is cleared on
    reopen, unchanged when right and put right when not.
  - Wave is an iteration field with a wave's dates, and Order a number. Both are moved by a reordered plan and cleared
    for a requirement in no wave. An iteration is kept by its id when its dates change.
  - It covers the rule Started on follows.
- `test/github-project-adopt.test.js` — whose issues the mirror and the build status take for their own. They take the
  owner's and the workflows' bot's (`app/github-actions` as gh gives it), never a stranger's or another app's. The
  bot's first apply makes them, and its second changes nothing. An apply by any other login is refused.

## The mirror's workflow and other workflows

- `test/github-project-run.test.js` — that mirror run by its workflow.
  - The issues are written with the workflow's token and by its bot, and the project with `PROJECT_TOKEN` alone. A
    second run changes nothing.
  - A missing or refused project token is a warning, with the issues mirrored alone. A seed with warnings applies
    nothing.
  - `--accept-warnings` and `--allow-removals` are refused, and anything else is an error. No token is printed, and the
    command hands over in GitHub Actions.
  - It covers the time budget. Issues the creator list does not give back are still made once, and never again by a
    later push; the newest issues show them.
  - More than 20 creates on a board with its issues are refused, and GitHub's rate limits are a warning.
- `test/github-project-downgrade.test.js` — that mirror when a requirement's proof goes down, and when GitHub is slow.
  - Proof going down is proved to part or open. The issue is reopened and relabelled, and Status and Closed on are put
    right. The edits are done before any creating.
  - GitHub may be slow to list the bot's new issues. They are looked for again, and the newest issues read too. There
    is no duplicate and no needless stop.
- `test/github-project-workflow.test.js` — the workflow that runs that mirror. It is woken by a push to main alone, and
  `issues: write` is its one write permission. One run goes at a time and none is cancelled. Main is checked out with
  nothing installed, the one command runs, and the project secret is given only to it.

## Claude's workflows

- `test/claude-review-workflow.test.js` — the workflow that leaves Claude's review on a pull request.
  - It is woken by a pull request, never `pull_request_target`. It is skipped for forks, drafts and Dependabot.
  - `pull-requests: write` is its one write permission. The token is given only to the step that checks it and to the
    action.
  - No checkout keeps credentials, and the review approves, pushes and edits nothing.
- `test/stuck-prs-workflow.test.js` — the workflow that labels an auto-merge pull request stuck on a conflict with
  main, and comments once so its owner wakes.
- `test/working-group-workflow.test.js` — the workflow that lets Sara keep up with the working group discussion.
  - It wakes Claude only when a comment names Sara, at most once a day. Claude writes a draft and has no GitHub tools.
  - Only the post job may write, and only to discussions. It checks out nothing and runs no code of the repository.
  - Only the owner, members and collaborators wake it. A separate job checks the draft from a fresh checkout of main.
- `test/code-scanning-fixes.test.js` — the code scanning alerts of #849, each fixed at its cause (risks SEC-11 to
  SEC-15). Each slow pattern is given text made to slow it, and each one-pass removal is fed nested pieces.
- `test/code-scan.test.js` — the code scan CI runs on every change (#849). It fails on any security problem, and its
  log names only the kind of each problem and how many.
- `test/claude-workflows.test.js` — every workflow that runs Claude (risk TRUST-5). A comment wakes Claude only when
  its author is the owner, a member or a collaborator. No step after Claude, in Claude's own job, runs repository code.
  A file outside the checkout that Claude must read sits in a folder named by `--add-dir`.
- `test/github-project-blocks.test.js` — that mirror's blocked-by links. Each open question's issue blocks the issues
  of the requirements it blocks, made once. A link the requirements dropped is removed, and a person's is kept. A
  refusal by GitHub is a warning, with the issues and project still mirrored.
- `test/github-project-milestones.test.js` — that mirror's milestones, read from the waves file. Each wave names one,
  and each requirement's issue is filed under its wave's. A milestone is due on its last wave's end, and closes once
  its issues are all closed. A person's milestone is kept, and a refusal by GitHub is a warning.
- `test/github-project-plan.test.js` — that mirror's plan: what differs between the desired state and what GitHub holds, for the issues, the labels and the project.

## Benchmarks, licences, network and policy

- `test/instruction-counts.test.js` — the benchmarks' work counted in CPU instructions. Cachegrind's output is read,
  and each case counted less its setup. The claims are checked. Nothing is counted, and it says so, where Valgrind is
  not installed. Every benchmark case still does its work.
- `test/ignore-entries.test.js` — an entry of `.ignore` that git ignores as build output may be missing in a fresh
  checkout. Any other entry that names a file must exist, so a misspelt path is caught.
- `test/licences.test.js` — licences through the whole build chain, and the one allowance for a GPL tool run in CI alone and never shipped.
- `test/offline.test.js` — no network request but the one exception, a send to an AI model the user set up. The
  bundled engine makes none. The core's AI send makes none of its own, going only through the transport it is handed.
- `test/policy.test.js` — the plugin-store files, supply-chain pins and least-privilege CI. It also covers the one
  module that may reach the network, reached only from the send dialog. Nothing in the AI's folder runs on a timer or
  an event.
## Workflows and the desktop app

- `test/workflow-timeouts.test.js` — every job of every workflow sets a time limit. So a hung step never holds a
  runner for hours (editor spec §13, ci_jobs_time_limited).
- `test/workflow-keys.test.js` — no workflow names a key twice in one map. GitHub can't read such a file, and shows a
  failed run on every push with no job run (#847).
- `packages/app/test/app-config.test.js` — the desktop app is shut by default. Its window loads only its own pages,
  reaches no other origin, and calls only the app's seven folder commands (spec §41, standalone_app).
- `test/standalone-app.test.js` — the built desktop app, driven through tauri-driver. It lists, draws and writes
  notes. Its window refuses any other address (spec §41, standalone_app).
- `test/vscode-plugin.test.js` — the built VS Code extension, against a stand-in for VS Code. Its tab draws a note
  and writes an edit to it in a real browser. It reaches the folder only through checked calls, and loads only its own
  files (spec §41, vscode_plugin).
- `test/releasing.test.js` — RELEASING.md lists the steps of a release in order and how to go back. It names every
  secret a workflow uses (editor spec §13, release_steps_written).
- `test/release-prepare.test.js` — one command bumps every file that carries the version, both lockfiles included
  (editor spec §13, release_steps_written).
- `test/release-from-main.test.js` — a stable release is built only from a tag on main. The release's first job checks
  the tag before anything is installed, and every other job waits for it (editor spec §13, release_from_main).
- `test/ai-disclosed.test.js` — the AI use disclosed in the README. Content goes only to models the user sets up, only
  when the user sends it. The one exception to no network use is stated precisely (spec §19, ai_disclosed).
## Being public, and pull requests

- `test/public-readiness.test.js` — fit to be public and kept so. It covers a clean history, and a fresh clone set up
  from the README alone. It also covers GitHub settings that let only a collaborator contribute.
- `test/pr-checks.test.js` — what an AI agent's pull request must say: a `Requirements:` line, its label, no private
  session link, and a test seen failing first. It also covers the workflow that checks this, and the template.
- `test/repository-scans.test.js` — the source scans behind the one network exception. The AI send module is found
  however it is imported, and Obsidian's `request(` is taken for a request. Every timer and event is found.

## What CI runs for a change

- `test/fresh-clone.test.js` — when a pull request runs the fresh clone. It runs only for a change that can alter what
  the README's steps do. That is the steps, the npm scripts, the hook or the git settings (spec §13, Delivery).
- `test/merge-queue.test.js` — the workflows behind the required checks also run in GitHub's merge queue.
- `test/ci-plan.test.js` — what CI runs for a change. A pull request, draft or ready, runs only the tests its change
  reaches. The label `ci:full` runs everything from the next push. Main, the nightly and a release run everything, and a
  failed plan runs everything too (spec §13, touched_tests_only).

## The quality ratchet and the test runner

- `test/quality-metrics.test.js` — the quality metrics are held to a committed baseline, and a worse one fails without a recorded reason.
- `test/quality-baseline.test.js` — the baseline cannot be loosened without a reason, is whole, and says which machine measured it.
- `test/quality-instructions.test.js` — the instruction counts in the ratchet.
  - There is one metric for each benchmark, with a small tolerance. It is held only against counts from the same
    machine.
  - It is not measured where Valgrind cannot run, which fails only on Linux. The counts are recorded and printed until
    the baseline holds them.
  - A claim that does not hold always fails. Test duration only warns.
- `test/risk-register.test.js` — the register of known risks is well formed. The release is stopped by an open fix-now
  risk, an overdue one or a stale one. RISKS.md is what the script writes from the register.
- `test/risk-panel-workflow.test.js` — the risk panel workflow runs by hand and spends a Claude session only when
  something moved. It keeps its token to one step, and its one writing job keeps an issue up to date with gh alone.
- `test/second-opinion.test.js` — the second opinion hands a pull request's diff, or the latest panel issue, to the
  owner's own Gemini and Grok tools. It skips one not installed and heads each comment with its model.
- `test/security-alerts.test.js` — the security alerts each release reads, through a fake GitHub and OSV. A stable
  release stops on any open alert, a nightly on high and critical ones, and a list not read is never taken as empty.
- `test/security-workflow.test.js` — the release, its dry run and the nightly read the security alerts in a job that
  installs nothing. The daily Security workflow writes its issue with gh alone, and fixes only on security branches.
- `test/quiet-reporter.test.js` — the quiet test run when a failure's details cannot be passed on, as when an assertion
  holds a function. Every failure is still reported, and the run failed, never crashed.
- `test/run-ceiling.test.js` — every run of the npm test commands, in CI too, is stopped with one line at a memory or
  time ceiling. That happens before a runaway test can exhaust the machine. A run within both passes through unchanged.

## The requirements, slices and slice board

- `test/requirements.test.js` — the requirements graph, the one source: started requirements proved, tests where they say.
- `test/requirements-note.test.js` — the requirements kept as a graph note. The graph as the one block of a Markdown
  note is read by every tool that reads the requirements. It passes the same audit as the graph file
  (requirements_as_graph_note).
- `test/requirements-drift.test.js` — the requirements and the tests may not drift further apart: each list in
  `quality/requirements-drift.json` only shrinks (editor spec §12, requirements_drift_ratcheted).
- `test/check-requirements-flips.test.js` — the requirements graph is edited here, in pull requests (Roger, 16 Oct
  2026: no vault holds it any more).
  - Records, links and comments may be added, changed and removed.
  - A pull request never moves a test back in status. Only planned to partial, partial to written, and planned to
    written are allowed.
  - It never flips one forward without its file, and never removes a test that is partial or written.
- `test/slice-done.test.js` — a slice is done only when every one of its requirements is proved by a written test whose
  file is there.
  - The copy's banner must be as it should be, every slice a whole number, and every test kept where the check knows.
  - `check-requirements.mjs --done <slice>` says so or lists what is missing. The slice board's overview says the
    same. Each is tried on tampered copies of the requirements.
  - Every slice before the one under way is done (spec §12, done_means_proved).
- `test/readme-status.test.js` — the README's status line is made from the requirements graph, never by hand
  (readme_status_generated). It names how many slices there are, which are done and which is in progress.
  `node scripts/readme-status.mjs --write` puts it right after a slice is done.
- `test/slice-board-style.test.js` — the slice board's stylesheet. Its colour tokens agree in light and dark, and the
  altitude switch works by CSS alone. The layout holds at 400px. The source is written one rule and one declaration to
  a line.
- `test/slice-board.test.js` — the slice board: a CSS-only HTML page of how far the slice under way is proved. It is
  made from the requirements copy and, optionally, the open pull requests.

## The wiki and its pages

- `test/waves-on-time.test.js` — the plan stays true to the work. A wave behind for more than its own length fails,
  unless `requirements/waves.json` gives its reason.
- `test/wiki.test.js` — the project wiki. Every page is made from its file in the repository, ending with the file and
  commit it came from. The proved counts are as the slice board gives them. Every answered question is a decision and
  every other open. The roadmap's chart is free of the characters it reads as syntax. The releases come from GitHub or
  `versions.json`.
- `test/rename-to-thoughtknot.test.js` — the rename to ThoughtKnot (`scripts/rename-to-thoughtknot.mjs`): every form of the product name changes. The repository's address, its site, the GitHub Project's title and the kind of note keep theirs. A second run changes nothing.
- `test/wiki-developers.test.js` — the wiki's developer pages.
  - The architecture graph names only paths and requirements that exist, and every package. It is drawn with each
    thing's kind, and a planned part dashed.
  - Every extension point, contract check, design token, host member and problem code is listed from the code.
  - Each requirement is marked released, nightly only, being built or planned against the latest release.
  - The plug-in example installs and passes its contract.
- `test/wiki-guide.test.js` — the wiki's user guide. Every screenshot taken is shown once, and no other is asked for.
  Every setting is listed from the editor's own options, in plain words. A new button of the drawing is reported when
  the guide does not explain it.
- `test/wiki-review.test.js` — the review of the wiki pages people write or edit. Each is checked and never changed.
  There is a suggestion for each broken link or picture, old version and long sentence. A person's edit to a made page
  is reported, and an issue text pings no one.
- `test/plan-actuals.test.js` — the wiki's Plan versus actual page (`scripts/plan-actuals.mjs`).
  - A requirement is proved on the first day main held all its tests as written. Main's history is read merge by merge,
    through the move of the requirements file from `.gql` to `.md`.
  - Each wave shows its plan, its first and last proved days, the first stable release after and its slip.
  - The page lists what was proved each day, the seven-day rate, and a forecast for each wave left.
- `test/wiki-workflow.test.js` — the workflow that makes the wiki. It is woken by a push to main or a stable release.
  The pages are made with read access only, and the one job that writes runs no code of the repository.

## The wave nightly and the jobs that write

- `test/wave-nightly-workflow.test.js` — the build made when a wave ends. A pull request labelled `wave-done` runs the
  nightly when it merges. A gate first checks the board: every item of that wave must be Done and proved.
- `test/workflow-writers.test.js` — which workflow jobs may write to the repository, and what else each may touch.

## The nightly build, the home page and test files

- `test/nightly-workflow.test.js` — the nightly pre-release, run each night and by hand. It is built only when main
  moved, and published only after the full suite passes. The one job that writes runs no code of the repository. The
  last seven are kept, with the version `scripts/nightly-version.mjs` gives it.
## The home page and its live demo

- `test/site.test.js` — the project's home page, made from `site/index.html` and `site/words.json`.
  - Every word is used and none is missing.
  - It has the search and AI basics: title, description, canonical address, structured data, sitemap, robots and
    llms.txt.
  - It meets WCAG 2.2 AA in both schemes, and no side is said by left or right.
- `test/site-demo.test.js` — the home page's live demo, built by `scripts/site-demo.mjs` and drawn by the plugin.
  - Its note holds the project's own graph files whole, and its page loads its own files only.
  - In Chrome it draws every graph, an edit in the pane redraws its card, and no request leaves the page.
- `test/site-workflow.test.js` — the workflow that publishes the home page. It is woken by a push to main, each morning
  or by hand. The page is made with read access only. The one job that writes to GitHub Pages runs no code of the
  repository.
- `test/speed-index.test.js` — the one measure of a machine's speed, which the quality metrics record and scale their
  timings by. It is fixed plain work, the least of seven runs.
- `test/timed-assertions.test.js` — a test asserts the work done, never the time taken. No JavaScript test or its
  support asserts a span of elapsed time. A polling deadline, mock timers and a clock handed to the code tested are
  allowed.
- `test/test-files.test.js` — every file a test or a device-check note names is made by `scripts/make-test-files.mjs`
  (editor spec §12, tests_self_contained, test_files_generated). The images it makes decode and move: the GIF's
  compressed data, the APNG's frames, the WebP's lossless frames, the SVG and the PDF.
- `test/test-vault.test.js` — the test vault: dummy notes tied to requirements, nothing Obsidian writes committed, each session clean.
- `test/security-response.test.js` — the security response page (editor spec §66): sources, ranks, owners, release gate.
- `test/trust-model.test.js` — the trust model (editor spec §54). The wiki page names every actor and boundary. Each gap
  is a risk in the register, and every file that opens a boundary is on the page.
- `test/test-status-partial.test.js` — the third test status, `partial`: a test whose file is there but does not yet
  prove every rule its record covers. It needs its file like a written one. It leaves its requirement unproved in
  `--done`, and the reason says partial. It may be flipped to only from planned, and to written; every backward move is
  refused. It counts on the slice board as part and in progress, never proved.

## The tests-first replay

- `test/tests-first.test.js` — every test is seen to fail before its code, replayed commit by commit: how a replay judges a new test.
- `test/tests-first-command.test.js` — that replay's command line, run as CI and a person run it: `--check`, `--excuse` and `--migrate`.
- `test/tests-first-complete.test.js` — that command line's `--complete`: a commit that changed a test and has no record fails, until `--update` records it.
- `test/tests-first-failing.test.js` — that replay when a new test fails at its own commit. It is kept in the record as
  not replayed. When it passes run again, that is a failure of the record.
- `test/tests-first-faults.test.js` — `--excuse --fault` keeps the reason a test failed at its own commit. It does so
  only for a test the records hold as a fault. `--tally` and `summary` count it as `faultsExcused`, not as not
  replayed, and `--check` does not warn of it.
- `test/tests-first-checkout.test.js` — that replay's checkout of a commit. Its own workspace packages are linked under the scope its manifests give. So a commit from before a package scope was renamed still runs its own code.
- `test/tests-first-keeping.test.js` — that replay when something at the commit's own code cannot be trusted. That is a
  commit that cannot be replayed, or a record updated over what it holds.
- `test/tests-first-later.test.js` — that replay when the test and its code do not come together. It covers a test
  corrected later, one that comes before its code, and a new file whose code is not there yet. It also covers test
  support changed with it.

## The tests-first replay: more cases

- `test/tests-first-passed.test.js` — that replay when a new test passes against the code before it. It is reported,
  unless a reason is kept, and never excused by a name every object has.
- `test/tests-first-python.test.js` — that replay over a Python test, and a failure inside a subTest read as a failure.
- `test/tests-first-records.test.js` — the records of that replay: a file for each commit, so two branches never conflict in them.
- `test/tests-first-records-history.test.js` — this repository's own records. The old single files' entries are all
  held, and each record is named after a commit in the history. Every test file has its entry.
- `test/tests-first-records-merged.test.js` — those records when branches meet: two branches merged with nothing to resolve, and the old single files moved over whole.
- `test/tests-first-records-reasons.test.js` — the reasons kept for a test that passed before its code: a file for each, named after its test file and its test.
- `test/tests-first-tally.test.js` — that replay's `--tally`: what the records prove as JSON, and writes nothing.
- `test/tests-first-unfinished.test.js` — that replay when a run of a test file does not finish: stopped at the time limit, it proves nothing.
- `test/tests-first-run.test.js` — one run of one test file in that replay: what its report shows, and why it did not finish.

## Accessibility: WCAG and meaning

- `test/wcag.test.js` — every view and page of every host passes axe-core's WCAG 2.2 A and AA rules and the 4.5:1 text
  contrast.
  - It checks the light and the dark theme (editor spec §11, wcag_aa, wcag_new_hosts, wcag_checked).
  - Obsidian's views are its card in each state, its details, edit pane, export form, AI send dialog, proposal and
    quick-info tooltip.
  - They also include its style, step and view blocks, table, Live Preview card, settings and the menus it gives
    Obsidian.
  - The browser editor's page is checked in each state.
  - The check is tried on planted faults first, and a host with no entry fails.
- `test/a11y-semantics.test.js` — every control of every view and page of every host, as axe-core reads the
  accessibility tree (editor spec §41, a11y_semantics_auto).
  - The views are those `test/wcag.test.js` checks, kept in `test/repository/views-obsidian.js` and `views-page.js`.
  - Each control has an accessible name, is read as a control and says its state (checked, selected, expanded).
  - Each drawing's text version counts the things drawn, and says each as its box is labelled.
  - The check is tried on planted faults first.

## Accessibility: the keyboard

- `test/a11y-keyboard.test.js` — a keyboard-only run of every view and page of every host, the views
  `test/wcag.test.js` checks (editor spec §41, a11y_keyboard_auto).
  - Tab and Shift+Tab reach every element of the tab order, with the page's own key handlers live.
  - No element keeps the focus. A field that takes Tab is left with Escape then Tab.
  - An action out of the order is in a widget whose arrow keys reach it. One of each kind of action the page draws
    itself is operated with Enter or Space.
  - A dialog of ours keeps the focus in it, and is left with Escape from every control.
  - The check is tried on planted faults first. The browser editor's page is run in the four files below. Each of its
    states is checked to be in one of them.

## Accessibility: the keyboard on pages and devices

- `test/a11y-keyboard-page-1.test.js` — part 1 of the keyboard-only run of the browser editor's page. It runs the
  states `test/repository/keyboard-page.js` gives part 1. They are split over four files so they run side by side
  (editor spec §41, a11y_keyboard_auto).
- `test/a11y-keyboard-page-2.test.js` — part 2 of the keyboard-only run of the browser editor's page. It runs the
  states `test/repository/keyboard-page.js` gives part 2. They are split over four files so they run side by side
  (editor spec §41, a11y_keyboard_auto).
- `test/a11y-keyboard-page-3.test.js` — part 3 of the keyboard-only run of the browser editor's page. It runs the
  states `test/repository/keyboard-page.js` gives part 3. They are split over four files so they run side by side
  (editor spec §41, a11y_keyboard_auto).
- `test/a11y-keyboard-page-4.test.js` — part 4 of the keyboard-only run of the browser editor's page. It runs the
  states `test/repository/keyboard-page.js` gives part 4. They are split over four files so they run side by side
  (editor spec §41, a11y_keyboard_auto).
- `test/a11y-keyboard-devices.test.js` — the keyboard-only run of every view of the Obsidian host again. It runs on a
  phone and on a tablet with a keyboard attached, where the layout differs. There are tabs and a bottom sheet in the
  pane, and a sheet for the details (editor spec §11, keyboard_any_device).
- `test/a11y-keyboard-devices-page-1.test.js` — half 1 of the keyboard-only run of the browser editor's page in a
  phone's width, its phone layout. It runs the states `test/repository/keyboard-page.js` gives half 1 (editor spec
  §11, keyboard_any_device).
- `test/a11y-keyboard-devices-page-2.test.js` — half 2 of the keyboard-only run of the browser editor's page in a
  phone's width, its phone layout. It runs the states `test/repository/keyboard-page.js` gives half 2 (editor spec
  §11, keyboard_any_device).

## Speed and plain words

- `packages/core/test/slow-notes.test.js` — the slowest real notes are kept as fixtures. Each is laid out within a work
  limit, every thing drawn by our own engine (editor spec §68, layout_real_fixtures).
- `test/speed-budgets.test.js` — each host held, in CPU instructions, to a budget (editor spec §41, speed_budgets).
  - The budgets are for drawing 50 things and 500, and a cold start of each host. There is one too for a query over a
    10 000-thing mesh: 100 notes of 100 things, until slice 6 builds the mesh.
  - Every budget is set in `scripts/benchmarks/budgets.mjs`, with where its number comes from.
  - Each is a benchmark's claim in the quality ratchet, and each case does its work. A count over its budget breaks
    the claim.
- `test/ux-copy.test.js` — every message the user reads in every view of every host (editor spec §41, ux_copy_auto).
  - The views are those `test/wcag.test.js` checks, with the notices and menu items the host shows. The person's own
    words are left out.
  - Each message reads at grade 9 or lower, keeps its sentences to 25 words and uses none of the listed jargon. It is
    scored by `scripts/plain-english.mjs`.
  - A message that misses for a reason is recorded in `quality/copy.json`. It may never score worse without the record
    raised.
  - The check is tried first.
- `test/ux-journey.test.js` — the first-run journey in every host (editor spec §41, ux_journey_auto).
  - A person opens a note, reads its graph, edits it, fixes a problem and exports it. Each host's journey is in
    `test/repository/journey-obsidian.js` and `journey-page.js`, and each stage checks what it left.
  - Every action goes through `scripts/ux-journey.mjs`, which counts it. An interaction is one action. A step is a run
    of interactions on one control. Each control is found by the name a screen reader says.
  - The counts are metrics of the quality ratchet, held by `quality/baseline.json` with no room. One more step or
    interaction fails unless `quality/accepted.json` records why.
  - The counting and the ratchet's hold are tried first, and a host with no journey fails.
- `test/plain-docs.test.js` — every document and code comment is plain language for a reader with ADHD (editor spec §41, plain_docs_auto). Sentences keep to 25 words and paragraphs to 80. A heading comes at least every 400 words, and no filler words are used. The reader pages read at grade 9 or lower. `quality/plain-docs.json` counts the misses each file had when the check came in, and a count may only fall.

## Pointer targets, reflow and whitespace

- `test/chrome.test.js` — the headless Chrome these checks share (`scripts/chrome.mjs`). It asks Chrome for its
  first page again while the list is empty, as Chrome answers before that page opens.
- `test/a11y-targets-reflow.test.js` — pointer targets and reflow in a real Chrome (spec §41,
  a11y_targets_reflow_auto; SC 2.5.8, 1.4.10).
  - It runs every view of every host. That is the Obsidian harness in the user guide's states, and the browser page
    served over a vault, with each of its phone tabs.
  - Each view is run as wide as a desktop and at 320 CSS pixels. Every control is 24 by 24 at least. The drawing's
    boxes and a link in a sentence are aside.
  - There is no sideways scroll at 320. Every control seen wide is still there and in reach.
  - The judging is tried first on made-up measures and planted faults.
  - Chrome is `THOUGHTKNOT_CHROME` or the first on the PATH (`scripts/chrome.mjs`). With none it skips in one line,
    except in CI.
## Languages laid out in a browser

- `test/pseudo-layout.test.js` — the test languages laid out in a real Chrome (editor spec §42,
  pseudo_locales_checked; `scripts/pseudo-layout.mjs`).
  - It runs every view of both hosts, as the reflow check does, in `en-XA` and then in `ar-XB`.
  - No words may be cut off by their box, or drawn over other words in the same layer. A menu or sheet over the page
    is a layer of its own.
  - The judging is tried first on made-up measures and planted faults.
  - Chrome is `THOUGHTKNOT_CHROME` or the first on the PATH (`scripts/chrome.mjs`). With none it skips in one line,
    except in CI.
- `test/label-fit.test.js` — right-to-left labels fit their boxes in a real Chrome (editor spec §42, bidi_labels;
  `scripts/label-fit.mjs`).
  - The Claude Code host's page draws a note named in Arabic, Hebrew, and both mixed with English and numbers.
  - Each thing's words must sit inside its box. The judging is tried first on made-up measures and a planted fault.
  - Chrome is `THOUGHTKNOT_CHROME` or the first on the PATH (`scripts/chrome.mjs`). With none it skips in one line,
    except in CI.

## Drawings against their references

- `test/visual-regression.test.js` — every view's drawing against its committed reference, in the light and the dark
  theme (spec §41, visual_regression_auto).
  - The views are each view of each host that draws, the views `test/wcag.test.js` checks.
  - Each drawing is written as a picture by `test/repository/visual.js`. It holds each shape's geometry and words, and
    its paint as the theme's stylesheet works it out. Classes and ids are left out, and numbers are cut to a hundredth.
  - The pictures are held against `test/visual/`. Each reference is recorded in `quality/visual.json` with its hash, a
    reason and the day.
  - A drawing that changes fails until it is accepted. To accept it, run
    `THOUGHTKNOT_VISUAL_ACCEPT="why" npm run -s test:ai -- test/visual-regression.test.js`. CI never accepts.
- `test/whitespace.test.js` — the three copies of the one whitespace set are the same, and the set is openGQL's.

## Massive graphs

- `test/massive-graphs-design.test.js` — the research note on massive graphs (editor spec §53, scale_design). It is
  in the wiki, compares the ways with measured numbers, and records Roger's pick.
- `test/massive-graphs-benchmark.test.js` — the scale benchmark (editor spec §53, scale_benchmark). It grows the
  V-10 graph up to 100 times and records each step's time and memory. It names a step over its budget.
- `test/massive-graphs-limits.test.js` — the limits looked at again (editor spec §53, scale_limits_revisited). The
  design note gives each limit before and after. A hostile graph past a new limit is still refused, saying why.
- `test/gpu-painters.test.js` — the WebGL 2 and WebGPU painters in headless Chrome (editor spec §53,
  scale_gpu_painters). WebGL 2 must paint the overview as the 2D canvas does. WebGPU's shaders must build, and a frame
  must paint with no error.
- `test/space-painters.test.js` — the 3D view's painters in headless Chrome (editor spec §53, scale_space_painters).
  WebGL 2 must paint the city where the 2D canvas does. The drawing on screen must read as marks with its colours.
  The view's mini-map must copy each thing and move the view when pressed (space_mini_map). A thing moved by a new
  layout must glide there, a frame at a time (layout_glide).
- `test/massive-view.test.js` — a graph too large to draw, shown as its overview, in headless Chrome (editor spec §53,
  scale_massive_card). Its search must find a thing in any group and fly there.
