# Contributing

**Who can contribute.** For now, only collaborators may open pull requests and issues. This holds until the community
release. Ideas, questions and bug reports are welcome in
[GitHub Discussions](https://github.com/rogerbucks/thoughtknot/discussions), which anyone may join. To ask to join as a
collaborator, start a discussion there and say what you would like to work on.

How the code is written here. Every rule a tool can check is checked: by `test/conventions.test.js`, by the linter, or by
CI. A change that breaks one fails before it is merged.

## How a change is made

- **Spec, then test, then code.** Each behaviour is a requirement in the spec first. Its test is written next and seen
  to fail, and only then is the code written. A commit message says which tests were seen failing first.
- **The requirements are edited here.** `requirements/editor-requirements.md` is the one source of the requirements,
  changed in a pull request like any file; no vault holds them (Roger, 16 Oct 2026). Once graph notes can hold it, the
  graph moves into one.

### The status of a test

- **A test in the requirements copy has one of three statuses.**
  - `planned`: no file yet.
  - `partial`: the file is there but does not yet prove every rule its record covers. This happens when several
    workstreams add cases to one shared file over time.
  - `written`: it proves them all.
- **A `partial` or `written` test must have its file.** A `planned` test whose file is there is refused.
- **A requirement is proved only when a test proving it is `written`.** A `partial` one leaves it unproved.
  `check-requirements.mjs --done` lists it with "partial" in the reason. The slice board counts it as part, in progress,
  never proved.
- **A test moves only forward:** planned to partial, partial to written, or planned to written. The flip check refuses
  every backward move, and a flip to `partial` needs the file.
- **A flip to `partial` moves no requirement in the build status.** Only a test newly `written` does, so nothing is
  Merged or Released on a partial test.

### Tests seen failing first

- **CI proves it.** `scripts/tests-first.mjs` replays each new commit. Its tests run against its parent's code, and
  every test new in the commit must fail there.
- **A test written after its code has its reason kept, or the build fails.** One example is a test that pins behaviour
  that already existed. Its reason goes in `test/seen-failing/`, one file for each test. It is written by
  `node scripts/tests-first.mjs --excuse <test file> <test> <reason>`. The file is named after the test file and a
  digest of the test.
- **What a reason holds.** A reason holds only `file`, `test`, `seen_failing_first`, `evidence` and, for a fault,
  `fault` (true) and `commits`. `--excuse` never overwrites one without `--force`. Its flags come before its arguments.
- **`--excuse --fault` keeps the reason a recorded fault is accepted, and which commit fixed it.** A recorded fault is a
  test that failed at its own commit. It names every commit at which the records hold the fault, so a later fault of the
  same test is not excused. It refuses a fault in a file none of whose tests could run, which the replay did not replay
  at all.
- **How the tally counts a fault.** `--tally` and `summary` count an excused fault as `faultsExcused`, not as not
  replayed. That leaves `excused` for the passed-first reasons.

### The records of the replays

- **The records of the replays are in `test/tests-first/`** (`node scripts/tests-first.mjs --update`). There is one file
  for each replayed commit that changed a test, named after the commit. They sit over `baseline.json`, the single record
  as it stood when it was split (11 Oct 2026), frozen at its head. Together they give, for each test file, what was seen
  failing first, what was excused, and what could not be replayed.
- **CI fails a commit since the baseline that changed a test and has no record** (`--complete`). So each commit's record
  is written once, on the branch that made it.
- **A test may come a commit before its code.** A new test may fail at its own commit, and again when its file is run
  once more there. It is then recorded as not replayed, naming it, and `--check` warns of it. One that passes the second
  time fails the record, and so does a run that did not finish, so it is run again.
- **A fault that comes back on every run** means the commit has to be rewritten together with its code. A test that
  failed at the parent is never taken for one held before: it is judged in the commit that makes it pass.
- **`node scripts/tests-first.mjs --tally` is for a reader outside the repository.** It writes nothing and prints one
  JSON document. The document holds the baseline's head and the counts for each test file: replayed, not replayed, seen
  failing, excused, passed first. It also holds every reason kept, with its file's path and its content. Add
  `--repo <dir>`, first, to read another repository.

### Merging the records

- **The records never conflict.** Two branches that replay different commits, or excuse different tests, write
  different files. No field is rewritten by every update. So any merge, GitHub's own among them, joins them with nothing
  to resolve.
- **Pull requests are merged with a merge commit only.** A squash or a rebase merge makes new commits. So the records of
  the branch's own commits name commits main never holds, and the new ones have none.
- **A branch begun before the split** merges main once. That merge conflicts in the two old files one last time. Put it
  right in four steps:
  1. Take main's `test/tests-first/baseline.json` (`git checkout origin/main -- test/tests-first/baseline.json`).
  2. Keep the branch's own `test/seen-failing.json`.
  3. Run `node scripts/tests-first.mjs --migrate`, which moves its reasons into `test/seen-failing/`.
  4. Run `--update`, which records its commits.
- **`--migrate` checks every reason before it writes any.** It leaves a reason main already keeps differently as it is,
  naming it, for a person to choose between the two.

### Checks, review and writing

- **The gate before every commit:** `npm run format:check`, `npm run lint`, `npm run typecheck` and `npm test`, plus
  `ruff check` and `ruff format --check` when the Python library changed. CI runs them all again.
- **Cheap checks while working.** Each runs less than the gate does.
  - `npm run test:ai` runs the suite quietly. It prints one line when all pass. For a failure it prints only its file
    and line, name, short expected and actual, and the first stack frame in our code.
  - `npm run test:changed` runs only the tests the change reaches. It finds them by the naming under "Tests mirror the
    code" and by the import graph (`scripts/import-graph.mjs`). That is every test that imports a changed file,
    directly or through others, or names it to build. It runs the whole suite when something shared changed.
  - `npm run test:ai:py` does the same for the Python library.
- **The cheap checks are for working.** `npm test` and the gate above still run in full before every merge, and in CI.
  `AGENTS.md` is the short guide for AI sessions, and `.ignore` keeps generated and bulky files out of code searches.
- **A large or risky change goes through a pull request**, and is merged only once CI passes on it. That means one that
  touches many files, changes a library both languages share, or changes the build, CI or dependencies. The biggest are
  reviewed before merging. A small, contained change may be committed straight to `main` once the gate passes.
- **UK spelling** in code, comments, messages and the interface.
- **Plain language for every reader, ADHD readers included** (Roger, 18 Oct 2026). This covers every document and code
  comment. Keep sentences to 25 words and paragraphs to 80. Put a heading at least every 400 words. Lead with the point,
  and use lists and tables where they help. Leave out filler words; `scripts/plain-docs.mjs` lists them, each with what
  to write instead. `node scripts/plain-docs.mjs <path>` lists what to fix. A file may never get worse, and a new file
  starts clean.

## Signing off your work

Every commit in a pull request ends with a sign-off line. It says the person who made it has the right to send it under
the project's licence, as the [Developer Certificate of Origin](https://developercertificate.org) sets out:

```
Signed-off-by: Your Name <you@example.com>
```

`git commit -s` adds it.

- **A commit any AI agent writes carries Roger's sign-off, not the agent's.** Claude and Antigravity are
  such agents. An AI cannot certify where code came from. Roger directs that work, so he certifies it (Roger, 19 Oct
  2026; widened to every agent 20 Oct 2026). Such a commit ends with this line, in place of `-s`:
  `Signed-off-by: Roger Bucks <264575592+rogerbucks@users.noreply.github.com>`. Add it with `git commit --trailer`.
- **CI checks it.** `node scripts/public-readiness.mjs --history` refuses a commit from 20 Oct 2026 on with no
  sign-off, or one that names only a bot or an AI. Merge commits and Dependabot's own updates are left out.

The sign-off is how a fork or a pull request stays clear about who wrote what. It also keeps the project free to stay
under the [Mozilla Public License 2.0](LICENSE). People who take part follow the
[code of conduct](CODE_OF_CONDUCT.md), and a fork goes by its own name ([TRADEMARKS.md](TRADEMARKS.md)). A security problem
is reported in private, as [SECURITY.md](SECURITY.md) says, never in a public issue.

## Obsidian’s guidelines

The plugin store's own linter (`eslint-plugin-obsidianmd`, run by `npm run lint` with no warnings allowed) checks most
of Obsidian's rules, sentence case in the interface among them. These are the guidelines it does not check:

- **Styles use the theme variables**, such as `var(--text-normal)` or `var(--color-orange)`, never a fixed colour. Every
  selector in `styles.css` is scoped by one of the plugin's own classes, `thoughtknot-*` or `gql-*`.
- **No inline styles and no HTML strings.** Classes from `styles.css`, `setCssProps` for values that change, and
  Obsidian's DOM helpers (`createEl`, `createDiv`), never `innerHTML`.
- **Every listener is registered.** Listeners on the app, the workspace, the window or the document go through
  `registerEvent` or `registerDomEvent`, so they go when the plugin does. A listener on an element the plugin made goes
  with the element.
- **Every timer is registered or cleared.** Intervals go through `registerInterval`. A timeout kept on a component is
  cleared with `clearTimeout` in its `onunload`. Timers are the window's (`window.setTimeout`), as the linter asks.
- **The vault changes only through its API.** Never the file system or the adapter. A note is changed with
  `vault.process`, so the change is made atomically against the note as it is now.
- **The app is `this.app`**, never the global `app`.
- **No network requests,** with one exception (spec §13, §19). The exception is a send to an AI model the user has set
  up, only when the user sends it. It is made by `packages/obsidian/src/ai/send.ts` alone with Obsidian's `requestUrl`,
  never an SDK. It is reached only from the send dialog. No databases and no remote images.

## Code style

- **One formatter for each language.** Prettier for JavaScript, TypeScript, CSS, JSON and YAML (`.prettierrc.json`:
  120 characters, single quotes). Ruff for Python. Run `npx prettier --write .` and, in `python/graph_spec`,
  `uv run --locked ruff format`. CI runs `npm run format:check` and `ruff format --check`.
- **TypeScript is strict** in every package (`"strict": true`). The core is written in erasable TypeScript only, so
  Node runs its tests with no build.
- **The Python library follows PEP 8**, checked by `ruff check`: rules E, W, F and N. Lines go up to 99 characters, the
  most PEP 8 allows by agreement. A `# noqa` is allowed only with its reason on the same line.
- **Tools are pinned exactly** and carry a licence on the allow-list. They run no install scripts, and are taken only
  once a release is at least 7 days old.

## Naming

- **Files:** kebab-case for JavaScript and TypeScript (`block-editor.ts`), snake_case for Python (`graph_svg.py`).
- **Types, interfaces and classes:** PascalCase (`GraphView`, `NoteReading`).
- **Functions, methods, variables and parameters:** camelCase (`readNote`, `linkInBlock`). A parameter that is not used
  starts with `_`.
- **Constants:** UPPER_SNAKE (`WRITE_AFTER_MS`), at module level only. Inside a function every name is camelCase.
- **Python:** snake_case for functions, variables and modules; PascalCase for classes; UPPER_SNAKE for constants.
- **Tests are named after their file:** `zoom.ts` is tested by `zoom.test.js`, and `graph_svg.py` by
  `test_graph_svg.py`. A name may add the aspect tested after a hyphen (`layout-parity.test.js` tests `layout.ts`). A
  test of behaviour that spans several modules is named after its subject and listed below.

## Layout

- **Each package keeps its code in `src/` and its tests in `test/`.** The Python library uses `src/` and `tests/`, as
  Python's tools expect. Tools that run from the command line go in `bin/`, and the browser harness in `harness/`. The
  Claude Code editor's local server runs in Node and goes in `packages/claude-code/server/`. It is held to the same
  naming, size and comment rules as `src/`.
- **One module, one purpose.** Each module opens with a comment saying what it is for, in a sentence of at least five
  words, and which part of the spec.
- **The public interface is documented where it is declared:** every export has its own comment, directly above it. In
  `packages/graph-spec`, whose modules are CommonJS, that is every name in `module.exports`, at its declaration.
- **The core is host-free:** it imports no Obsidian, editor or Node module, so it runs on a phone and, later, in VS Code.
- **Small modules, one responsibility each, in folders named for their feature** (spec §13, "No monolith files"). No
  source file is over 400 lines, and no test file over 600, checked in CI. A split follows responsibilities, never line
  counts.
- **Named so a search by name finds it:** folders and files are named for the feature they hold, never `utils`, `misc`,
  `helpers`, `common` or `lib`.
- **The README's "How the packages fit"** names every package, its layer and its guide, so a reviewer sees the whole
  before the parts.
- **Each package has a short `GUIDE.md`** saying where things live and naming every folder of its source. It changes in
  the same commit as the code it describes.
- **Small, typed interfaces:** a module exports a few typed things, so it can be used without reading its inside. In
  Python, every public module, class, method and function has its docstring (Ruff's D1 rules check it) and type hints.
- **A package's entry points stay put.** These are the modules other code and the vault import: `gql_profile.py`,
  `graph_rules.py`, `graph_spec.py`, `graph_svg.py`, `graph-spec-check.js` and the core's `index.ts`. They re-export
  the smaller modules, so a split never breaks a caller. The released `graph-spec-check.js` is built into one file and
  never edited by hand.
- **Tests mirror the code:** a module's tests sit in a file named after it, and each test file runs on its own in
  seconds. A test moved between files keeps its name, so the tests-first record knows it is not new.

## Tests that span modules

These test behaviour across modules, or the repository itself, so they are named after their subject. Each is listed
with what it proves in [docs/tests-that-span-modules.md](docs/tests-that-span-modules.md), by subject, and a new one
goes there. The conventions test fails on a test file that is neither named after a module nor listed.

## The requirements in a GitHub Project

### What the mirror makes

- **One way only.** `requirements/editor-requirements.md` stays the only source. `scripts/github-project.mjs` mirrors it
  into a GitHub Project titled "ThoughtKnot requirements", one issue for each requirement of the chosen slices
  (`--slices 3,4` by default). The issues and project items are derivatives: regenerated, never edited by hand, and each
  opens on its rule, then a do-not-edit banner. Its title is the requirement's section, a dot and the id's words.
- **Where each requirement goes.** `requirements/workstreams.json` maps a workstream id to its title and its requirement
  ids. A requirement it does not list falls to `S3`, and an id the current copy does not hold yet is fine.
- **Labels and status.** An issue carries the labels `slice-N`, `workstream:<id>` and `status:open|part|proved`, and is
  closed when proved. Its status is the one the slice board reads.
- **The project's fields.** They are Slice, Workstream, Proof (open, part, proved) and Build status. Build status has
  the options Not started, In PR, Checks failing, Checks passing, Merged and Released. The built-in Status field (Todo,
  In Progress, Done) is the board's own. The mirror never makes it or changes its options.

### Seeding the first values

- **The mirror makes Build status and its options.** It also **seeds** an item that has no value from where its
  requirement stands on GitHub (`scripts/build-status-seed.mjs`), never more:
  - proved on main and by the copy of a _published_ release (a draft does not count): Released and Done;
  - proved on main only: Merged and Done;
  - held by an open pull request of this repository, by its copy's diff or its `Requirements:` line: In PR and In
    Progress;
  - otherwise Not started and Todo.
- **A seed never overwrites.** A Build status already set is never overwritten, nor is a Status of In Progress or Done.
  Only Todo, the board's default and no choice, is replaced by a seed that says more. Nothing moves back from Released
  or Done.
- **What is proved on main is read from main through the API**, not from the checkout the script is run from.
  `--check` prints the tally of what it would seed for each option (`seeded Build status: …`, `seeded Status: …`) to
  confirm before `--apply`.
- **A requirements file the seed could not read is a warning.** That may be main's, a release's or a pull request's.
  `--check` says an apply would stop. `--apply` stops unless `--accept-warnings` is given, since it would fix wrong
  values for good.
- **After the first seed**, the values come from the build status workflow below, from GitHub's events alone.

### Finding and making the project

- **The project is found by GraphQL** (`repositoryOwner(login:) { projectsV2 }`, a user or an organization). It is never
  found by `gh project list`. That asks gh to resolve the owner's type, and fails ("unknown owner type") for a token
  with only the project scope.
- **The project is also made and filled through GraphQL.** It is made by `createProjectV2`, with the owner's node id. It
  is filled by `addProjectV2ItemById`, with the issue's node id. `gh project create` and `gh project item-add` are not
  used. Only `gh project item-edit`, which takes ids, is still used.
- **An owner that cannot be found is an error naming the owner.** So is an answer with no list of projects. Neither is
  ever taken for no projects, which would make the project a second time.

### Derived fields

- **Every other field is derived, never authored** (Roger, 15 Oct 2026). **Wave** and **Order** come from the waves plan
  below.
- **Closed on** is a date field, the day (UTC) of each issue's `closedAt`. It is set for every closed issue, those
  closed before the field existed too. It is cleared on reopen, and put right if anyone changes it.
- **Started on** is a date field. It holds the day a draft or open pull request of this repository first took the
  requirement on, by its copy or its `Requirements:` line.
  - The build status sets it where there is none. It keeps it when the pull request merges, and while another pull
    request holds the item. It clears it when the item is let go.
  - The seed carries the earliest day of the open pull requests that hold an item. So a sync sets it where none is.
  - A sync clears it only for an item Not started. That is one no pull request holds, with no test of it written and
    its Build status not past Not started. One proved, `part` on main, or In PR or later keeps it.

### The waves plan

- **The waves plan is `requirements/waves.json`**, the one place the order of the work lives. It holds the waves in
  order. Each has its workstreams in order and a planned `start` and `end`.
  - `estimate: true` marks the dates as estimates. The wave's title on the board then ends "· est.", and `--check`
    prints a note that they are estimates.
  - Its last wave is a placeholder with no workstreams, for Roger's held changes after all waves. The wave before it
    holds only the Obsidian community release (R2), which Roger put after all the planned work.
- **Wave is an _iteration_ field**, one iteration for each wave with its dates. It is made and kept by
  `createProjectV2Field` and `updateProjectV2Field` with `iterationConfiguration`. An iteration whose title is
  unchanged keeps its id, so the items keep their wave.
- **Order is a number field.** It is the wave's position times 10 000, plus the workstream's times 100, plus the
  requirement's. The requirement's position counts those its workstream lists, in its order, then those it holds by
  default. So 10 203 is the third requirement of the second workstream of the first wave.
- **A requirement whose workstream is in no wave has neither.** `--check` prints a tally for each wave. It warns of
  each requirement in no wave that is not proved.

### Running the mirror

- **See the plan with `npm run project:plan`.** It is a dry run and makes no network call, so it compares with an empty
  GitHub. `--check` reads GitHub and prints the real diff, changing nothing.
- **`--apply` prints the same plan, then does it with `gh`.** It finds each issue by its hidden
  `<!-- requirement:<id> -->` marker, and changes only what differs. It never deletes: an issue whose requirement went
  is labelled `requirement:removed` and closed, with a comment.
- **The full mirror runs on every push to main** (Roger, 15 Oct 2026, option A). It runs in
  `.github/workflows/project-mirror.yml`: `node scripts/github-project.mjs --apply --slices 3,4,5,6,7,8,9,10`. In
  GitHub Actions that hands over to `scripts/github-project-run.mjs`. So issues close and Proof follows main with no
  session doing it.
- **Two tokens.** The issues and labels are written with the workflow's own token, whose one write permission is
  `issues: write`. So the issues it makes are written by `github-actions[bot]`. The project is read and written with
  `PROJECT_TOKEN` (the project scope only). Each call is routed to its token.
- **Project trouble is a warning.** A missing `PROJECT_TOKEN` is a `::warning::`, and so is one GitHub refuses. Only a
  401, a 403 or "Bad credentials" is the token's trouble. Any other failure of a project call is a `::warning::` too.
  That is a mirror error, in gh's own words, such as an input the schema refuses.
  - In each case the issues are mirrored without the project.
  - A seed made despite warnings applies nothing, with a `::warning::`.
  - Neither fails the run. The workflow never passes `--accept-warnings` or `--allow-removals`.
- **The time budget.** An apply may take 45 minutes (`MIRROR_BUDGET_MINUTES` sets another), inside the job's 60. A
  first run makes some 2,000 paced calls. Once the budget is spent it makes no more and warns "board partly updated;
  the next push continues", exit 0. The next push plans again from what GitHub holds.
- **Rate limits.** GitHub's rate limits are a 403 or 429 that says "rate limit" or "submitted too quickly". They warn
  "rate limited; the next push continues", exit 0.

### Never twice, and only its own

- **No issue is ever made twice.** The first issue an apply makes is looked for at once in the list by its creator.
  Before making any, the apply looks among the hundred newest issues for one of its own that list missed.
  - Either way it stops creating and warns "bot-created issues aren't listed by creator=…; creating stopped to avoid
    duplicates", exit 0.
  - So a creator filter that ever failed could not make every push create the issues again.
- **At most 20 new issues in a run.** A run of the workflow makes at most 20 issues on a board that has its issues
  already. A first mirror makes them all. With more, it makes the first 20 and warns how many it left. It still applies
  everything else, so statuses keep moving. Each later push to main makes the next 20. Anything else is an `::error::`.
- **It runs main's own code only.** Woken by a push to main alone, it checks out main, installs nothing and keeps no
  cache.
- **One mirror runs at a time** (`concurrency: project-mirror`, `cancel-in-progress: false`). GitHub keeps one run
  waiting in the group. A newer push replaces the one that waited and never the one running. That is enough, since each
  run mirrors main as it stands.
- **Only what it made is its own.** An issue is adopted only when three things hold:
  - the repository's owner or `github-actions[bot]` wrote it (gh gives the bot as `app/github-actions`, the REST API as
    `github-actions[bot]`);
  - its body has the generated banner;
  - its marker is the last thing in it.
- **Others' issues are left alone.** Only those two logins' issues are read, and a marker anyone else writes is
  ignored. An issue whose banner or closing marker was edited away is no longer ours, so a new one is made.
- **The removal guard.** `--apply` stops, unless `--allow-removals` is given, when the requirements file holds no
  requirements or the plan removes more than 10 issues.

### Where the mirror reaches

- **It goes only where this checkout's origin says.** `gh` runs in the repository folder with `GH_REPO` and `GH_HOST`
  removed. It must point at the origin's repository or the run stops. It names the repository (`--repo`) or the owner
  (`--owner`) on every call.
- **Paced and capped.** Calls that change something are paced about a second apart. They are tried once more after a
  secondary rate limit. A list that comes back as long as its cap is refused. An origin on any host but github.com is
  refused, and an error never repeats a login or token from the remote.
- **Apply as the owner, or let the workflow apply.** Issues are adopted only when the owner or the bot wrote them. So an
  `--apply` signed in as any other login is refused before it changes anything: its issues would be made again by
  every later run.
- **The project is dedicated to the script.** Changing the options of Slice or Workstream replaces them in GitHub. That
  clears the value on every item, and the script sets the values again on the items it manages. A value on an item the
  script does not manage would be lost, so keep nothing else in this project.

## The build status of each requirement

### Where the status comes from

- **Where a requirement's build is up to shows on the project, from GitHub's events alone** (Roger, 15 Oct 2026). No
  person authors the "Build status" field or the built-in "Status" field. The mirror only gives an item its first values
  (see above). `scripts/build-status-run.mjs` sets them from what happens to a pull request, in the workflow
  `.github/workflows/build-status.yml`.
- **No hand-linking.** A pull request's items are the requirements whose tests its
  `requirements/editor-requirements.md` newly marks written, against the base branch's.
  - For a merged pull request, that is its merge commit against that commit's first parent.
  - For a release, it is the tag against the release before it.
  - Both files are read through the API as data. A file of over 3 MB is a warning and not read.
  - At most 200 requirements are handled for one pull request, with a warning above.
- **A helper opens a draft pull request as its first step,** with the line `Requirements: id1, id2` in its description.
  So the items it will build are taken on (In Progress, In PR) before any test of its copy is written.
- **Only that line of the description is read.** It is split at commas. An id is kept only if it is plain (letters,
  digits, underscore, dot and hyphen) and is in main's requirements file. Nothing else is ever echoed.
- **Once the copy marks tests written, the copy's diff decides.** An id the line names that the landed copy does not
  prove is let go, with a warning in the comment (never a failure).

### Which pull requests count

- **Lists are of this repository's own before any cap.** The open pull requests and the pull requests merged in a span
  are paged through, ten pages at most. Only those whose head and base are this repository are kept. So a crowd of fork
  pull requests cannot hide one that holds an item.
- **Issues are asked for by their creator.** The creators are the owner and `github-actions[bot]`. They come from the
  REST list endpoint, `repos/{owner}/{name}/issues?state=all&creator=…`, paged through. This holds in the build status
  and in the mirror, which adopts only those two logins' issues. So issues others file never reach the cap.
- **Not `gh issue list`**, which may use the search. That is capped at 1,000 and behind its index, so a create tried
  again could be made twice. A pull request, which that endpoint lists too, is left out.
- **Which pull requests.** Only those of this repository: one from a fork moves nothing and gets no comment. The pull
  requests an event names must still have, as their head, the commit its checks ran on. Merged counts only when the pull
  request merged into main.

### The stages and the comment

- **The stages.** An item moves through these, and never goes back from Merged or Released:
  - In PR while CI runs or has not started;
  - Checks failing when CI's run fails, and Checks passing when it passes;
  - Merged on the merge (a push to main), and Released when a release is published;
  - Not started again if the pull request is closed unmerged.
- **Only CI's own run counts as the checks.** It is found by its workflow path. The other workflows of a pull request,
  such as code scanning or the dependency review, are not the build's checks.
- **The built-in Status follows:** In Progress while a same-repository pull request, draft or open, holds the item; Done
  when it merges into main or is released. It is Todo again when the pull request closes unmerged. That is unless
  another open same-repository pull request still holds the item, which also keeps its Build status. Never back from
  Done.
- **One comment, updated at each step,** on the pull request. It has links to the items, the board and the run. There is
  none when a pull request moves no requirement.
- **A release comments** with the stage Released. It does so on each pull request merged since the release before that
  proved any of its requirements.
- **A locked pull request.** A comment is tried first. If it fails, the pull request's own `locked` field is read from
  the API (every pull request's is, and a merged one's is closed too). If it is true, the pull request is unlocked,
  commented and locked again in the one step.
  - The lock is taken up again with the repository's retry for a short failure of GitHub. If it still fails, the
    warning says that pull request `#N` was left unlocked.
  - It is made with the workflow's own token, with `pull-requests: write` as the only write permission. That is what
    locking needs, as the lock workflow shows.
  - When two runs would make it at once, it is looked for again just before it is made.

### Tokens and safety

- **`PROJECT_TOKEN` is for the board alone.** It is a classic token with the `project` scope, kept as a secret. It is
  used for listing the project, reading its fields and items and setting their values.
- **The workflow's own token does the rest.** The issues, the pull requests, the files and CI's run are read with it,
  and it also leaves the comments. `public_repo` was asked for to read issues and the signed-in login. It is no longer
  used by this workflow, and whether to keep that scope is the owner's call.
- **A missing token never fails CI.** When `PROJECT_TOKEN` is missing or GitHub refuses it (expired: 401), the run says
  so. It says it in a `::warning::` annotation and a line in the comment, and does not fail: CI never fails over it.
- **Nothing of a pull request is run with the secret.** The workflow follows the checks of a pull request instead of
  being woken by the pull request. Those checks are CI, and the `Build status trigger` workflow, which has no secret
  and does nothing. So its definition is the one on main, and its job checks out main, with no package cache.
- **No `pull_request_target`, no event text in a command line, and the script prints no token.** Runs are grouped by the
  commit of the checks, so one pull request's waiting run never replaces another's. Actions are pinned to commit hashes
  at least 7 days old.

## The wiki

The [GitHub wiki](https://github.com/rogerbucks/thoughtknot/wiki) is made from the repository by
`.github/workflows/wiki.yml`. It is made on every push to main and every release. So it is never edited by hand: an edit
there is overwritten.

`scripts/wiki.mjs` writes the status, roadmap, decisions, open questions, quality and releases pages. It writes them
from the files that hold them. It copies the pages written by a person from `wiki/`, filling each `<!-- wiki:NAME -->`
marker.

`wiki/How-to-use-ThoughtKnot.md` is the user guide, in plain words for people who are not technical. A change people
will see changes it in the same pull request. Its pictures are `<!-- wiki:shot NAME -->` markers, taken from the build
by `scripts/wiki-screens.mjs`. Each shot is a state of `packages/obsidian/harness`, listed in `SHOTS`. Its settings come
from the core's `OPTIONS`. A button of the drawing the guide does not name is a warning on the wiki's run.

People may edit the wiki too: their pages are never changed by the workflow. `scripts/wiki-review.mjs` checks each page
a person changed last. It runs on every run and on every wiki edit. The workflow keeps the suggestions in one open issue
labelled `wiki-review`, closed when none is left. A person's edit to a page the wiki makes is listed there before the
next run replaces it.

The developer pages are filled from the code by `scripts/wiki-developers.mjs`. They are `wiki/For-developers.md`,
`Architecture.md`, `Writing-a-plug-in.md` and `Adding-a-host.md`. The architecture is the graph note
`requirements/architecture.gql`: add a new package or interface there. A new extension point needs its words in
`POINT_ABOUT`, or the wiki's make fails. They describe main, the nightly build, and mark each requirement against the
latest stable release. To look at the wiki before a merge:
`node scripts/wiki-screens.mjs --out out/images && node scripts/wiki.mjs --out out --labels out/images/labels.json`.

## The quality ratchet

### What each release checks

- **Every release is walked through for accessibility** (spec §11). The keyboard and screen reader list is in
  [RELEASING.md](RELEASING.md), for what the automated WCAG check (`test/wcag.test.js`) cannot see. Every interface in
  every host meets WCAG 2.2 Level AA, and a new host does before its first release: add its views to
  `test/wcag.test.js`.
- **Every release measures the code** (spec §12). It runs the suite twice, so it is the release's job.
  `node scripts/quality-metrics.mjs --out quality/metrics.json` writes these:
  - file sizes, an `npm audit` count, a secrets scan and the bundle's size;
  - the work a fixed set of benchmarks takes, counted in CPU instructions and never in elapsed time;
  - the suite's duration, its flaky tests, the size of a passing quiet run and coverage.
- **`quality/baseline.json` is what each is held to,** by `node scripts/quality-check.mjs quality/metrics.json`. A
  metric that got worse fails the release, unless `quality/accepted.json` gives a reason for that change. The reason
  gives the metric, its baseline value (`from`), the value it may reach (`to`), why, and the day.
- **Tolerance.** Counts of files, findings and bytes carry no tolerance. Test duration is reported as a warning only,
  scaled by how fast the machine measured itself, never enforced. The quick ones (file sizes, secrets) also run in CI
  and in `test/quality-metrics.test.js`.

### Speed in instructions

- **Speed is the work the benchmarks take, in instructions** (Roger, 12 Oct 2026). `scripts/benchmarks/` holds a small,
  fixed set. Each is a deterministic piece of work with the claims it proves:
  - 50 things drawn (`draw_fifty`, within half a second's instructions on a phone);
  - the worst reads at the size limits (`reading_limits`, within the budget of reading again);
  - the refusals of `layout_contained` (`layout_refusals`);
  - naming thousands of things linearly (`naming`);
  - a keystroke reaching the note (`keystroke`, read-back costing less than reading).
- **A claim between two sizes or two cases is a ratio of instruction counts**, so it is exact on every run. Each setup
  first runs its cases' code once, small, so a first compile is never inside a ratio.
- **How the counts are taken.** `node scripts/instruction-counts.mjs` runs each case, and its setup alone, in a process
  of its own. It runs under Valgrind's Cachegrind (`--cache-sim=no`), as many at once as there are cores.
  - Node is pinned to one thread, with V8's predictable mode, a fixed collector schedule and one random seed.
  - WebAssembly is compiled once: the drawings' by the optimising compiler, in their warm draw.
  - It keeps each case less its setup. A case that counts nothing beyond its setup fails the run.
- **Where it runs.** It runs on Linux only: in the release, its dry run and the "Quality baseline" workflow. Those run
  on `ubuntu-24.04` with Node pinned exactly, and install Valgrind. A patch can move the counts. None of them may set
  `GITHUB_ACTIONS`.
- **Where it does not.** It does not run on Apple-silicon Macs. Where Valgrind is missing it says so in one line and
  counts nothing. On any machine but Linux that only warns, and the fast check never asks.
- **A count may grow by 5% before it fails** (`INSTRUCTION_TOLERANCE`). It is held only against counts from the same
  machine: operating system, processor, Node major and Valgrind. The full Node version and the CPU are said with them.
  A claim that does not hold always fails, and no reason can waive it.
- **Until the baseline holds the counts**, a run that counts them prints them, with the machine. A follow-up pull
  request commits them. Outside CI it passes on them. In CI (`GITHUB_ACTIONS`) it fails after printing them. It fails
  too when the baseline's were counted on another machine, as its job then is only to print them.

### Counting on your own machine

- **Counting on your own machine:** `npm run bench:local` (Docker running) builds `docker/benchmarks.Dockerfile`. That
  is a Linux image with Node 24 and Valgrind, its base pinned by digest. It runs `scripts/instruction-counts.mjs` in it
  with any of its arguments (`-- --only naming`, `-- --runs 3`).
- **What it is for.** It is for counts before and after a change on one machine, as Valgrind cannot run on
  Apple-silicon macOS. A full count takes about two and a half minutes on a 10-core Mac.
- **How it runs.** The repository is mounted, not copied. `node_modules` is a container volume of each checkout's own.
  So the host's is untouched and worktrees never share one.
- **The base image's age** is its digest's own creation date, recorded in the Dockerfile and held to 7 days before it
  was pinned. On a Mac it counts ARM Linux's instructions: they are never compared with CI's x86-64 baseline.
- **Valgrind is GPL-3.0, allowed as a tool run in CI alone and never shipped** (spec §13, build_tool_licences).
  `licences/bundled.json`'s `ciOnlyTools` names it. `test/licences.test.js` holds that nothing bundled, nothing inside
  what is bundled and nothing in `node_modules` can be on that list. It also holds that only the jobs and the
  developer-only image it names install it, each with `--no-install-recommends`.

### Moving the baseline

- **To move the baseline,** after a change is wanted, run the metrics script with `--out quality/baseline.json` on a
  passing suite, and commit it.
- **The baseline is held against its own earlier copy** (`quality-check.mjs --baseline-since <ref>`, run in CI and in
  the release). A metric that got worse in it needs an entry in `accepted.json` too. A count of secrets can never be
  waived. A baseline with a metric missing or tests left out is refused.
- **Check before tagging.** Run the "Release check (dry run)" workflow by hand on main before a release is tagged. It
  runs the jobs the release waits on: the quality job and public readiness. It runs them step for step and with the
  same workflow-wide settings as `release.yml`. It releases nothing, so a failure there costs no version number.
  `test/quality-baseline.test.js` holds the two the same.
- **A baseline from the CI runner:** run the "Quality baseline" workflow by hand. Download its `quality-metrics`
  artifact; its log prints the same. Commit its `metrics.json` as `quality/baseline.json` in a normal pull request.
- **Fingerprints.** Each benchmark is bundled on its own. Its fingerprint is the hash of its bundle, with the machine,
  Node, Valgrind and the flags. One whose fingerprint is unchanged since the committed baseline keeps that count. So
  only the benchmarks a change reaches are counted again.
- **Counting them all.** Tick "count every benchmark" to count them all; a release always does. Ticked, "spread" also
  writes `instruction-spread.json`, every benchmark counted three times. Its `largest_spread` is how far a count moved
  between runs there, which the tolerance must stay well above. The metrics record it, so the baseline carries it.
  `quality-check.mjs` refuses a baseline whose instruction tolerance is under twice it.

### Tests and time

- **A test asserts the work done, never the time taken** (Roger, 12 Oct 2026). The suite's second run has coverage on,
  which slows the core's code unevenly. It runs on a runner slower than a desktop, so no number of milliseconds holds
  there.
- **A test counts the work where the requirement is work.** Examples are a text never read, or a block read again only
  within its budget. A control shows the count sees the work when it is done.
- **Speed itself is the benchmarks' instruction counts.** `scripts/timed-assertions.mjs`, run by
  `test/timed-assertions.test.js`, fails any assertion on a span of elapsed time. A polling deadline in a loop that
  awaits, and Node's mock timers, are allowed.
- **A test waits for the state it asserts, never a number of milliseconds** (15 Oct 2026). A sleep holds only while the
  machine is as fast as when it was written. Under a loaded full run the work takes longer. Then the test fails once in
  a while and passes alone.
- **How to wait.** Wait with the test support's `until(() => …)` on the state asserted. Where nothing should change,
  wait for a positive sign that the work is done (a notice counted, the tools drawn again) and then assert.
- **Fixed sleeps are held down.** `scripts/fixed-sleeps.mjs`, run by `test/fixed-sleeps.test.js`, fails a fixed sleep
  beyond each file's allowance in `test/fixed-sleeps.json`. It also fails an allowance higher than the file needs, so a
  sleep taken out stays out.

### The engine's advisories

- **The Graphviz inside the engine is watched** (spec §13). `node scripts/engine-version.mjs` reads its version from
  the engine and checks the notices name it. It checks `quality/advisories.json` offline, and warns when the cache was
  last checked over 14 days ago.
- **Only `--refresh` and `--watch` ask:** OSV and NVD for Graphviz, merged, and OSV for the package that wraps it. The
  release's quality job refreshes and checks.
- **The "Engine advisories" workflow** runs every Monday at 06:17 UTC, and by hand. It is read-only: it fails when the
  published advisories differ from the committed cache. Then someone runs `--refresh` and opens a pull request. The
  plugin never asks.
- **A slow or failing service does not spend a version number** (OPS-5). `--refresh` asks each service up to three times,
  after 1 s and then 2 s. Say one still fails. If the committed cache is for this engine and was checked within 14
  days, the release goes on with that cache and a warning. Otherwise it fails as before. `--watch` never falls back.

### Who may write what

Every workflow runs with a read-only token. These jobs ask for more, each for one reason (OPS-12). A job that writes runs
no code of the repository where it can be avoided. `test/policy.test.js` fails when a job with a write permission is not
in this table.

| Workflow | Job | Writes | Why |
| --- | --- | --- | --- |
| build-status | `update` | pull requests | Posts the comment on each pull request that says which requirements it proves. |
| claude-review | `review` | pull requests | Posts the Claude review's comments. |
| engine-advisories | `report-failure` | issues | Opens an issue when the weekly advisory watch fails. |
| lock-conversations | `lock` | pull requests | Locks each pull request's conversation, as only a collaborator contributes. |
| nightly | `publish` | contents, id-token, attestations | Makes the nightly pre-release, attests it and removes old ones. |
| nightly | `drafts` | contents | Reads draft releases, which GitHub lists only to a token that may write. It changes none. |
| nightly | `report-failure` | issues | Opens an issue when the nightly fails. |
| pages | `publish` | pages, id-token | Deploys the home page to GitHub Pages. |
| pages | `report-failure` | issues | Opens an issue when Pages fails. |
| project-mirror | `mirror` | issues | Mirrors the requirements as issues and labels. |
| release | `publish` | contents, id-token, attestations | Checks the files the build job made, attests them and drafts the release. |
| report-failure | `report` | issues | Keeps one open issue per failing workflow, labelled `workflow-failure`. |
| risk-panel | `report` | issues | Opens the issue that carries the panel's findings. |
| security | `report` | issues | Keeps the issue that lists open security alerts. |
| security | `fix` | id-token | Lets the Claude action push its branches as the Claude app, so CI runs on them. |
| stuck-prs | `flag` | pull requests | Labels a pull request whose auto-merge is stuck on a conflict. |
| token-watch | `probe` | issues | Opens an issue when `PROJECT_TOKEN` has been refused three times in a row. |
| wave-nightly | `wave-nightly` | contents, issues, id-token, attestations | Passes the nightly the most its own jobs ask for. |
| wiki | `publish` | contents | Pushes the generated pages to the wiki's own repository. |
| wiki | `report` | issues | Keeps the wiki-review issue. |
| wiki | `report-failure` | issues | Opens an issue when the wiki fails. |
| working-group | `post` | discussions | Posts the working group's daily comment on #825. |
| working-group-reply | `post` | discussions | Posts a reply to a comment on #825. |

### Pins that are bumped by hand

Dependabot proposes the npm, uv, Docker base image and GitHub Actions updates (OPS-9). It cannot bump two pins, so
they move only on purpose. These are the Node patch (`24.20.0`) in the quality workflows and `setup-uv`'s `version:`.
Each changes with a new quality baseline, as a Node patch can move the instruction counts.

The release writes `npm sbom --sbom-format cyclonedx` as an asset. It has a checksum, and once the repository is public
an attestation. A user can list what is inside `main.js`.
