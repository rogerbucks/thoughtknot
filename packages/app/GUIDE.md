# The desktop app: where things live

The standalone app (spec §41, `standalone_app`) is the browser editor in a Tauri v2 window, over a plain folder of
notes. It works offline on macOS, Windows and Linux. The same window carries the phone and tablet app: Android now, iPhone and
iPad once Roger's Apple account is ready (`android_app`, `ios_app`).

There is no server inside. The window runs the browser editor's page from the Claude Code host unchanged. The page's
calls are answered in the window itself, from the folder the person picked. So there is one editor page for the
browser and the app, and nothing to port to Rust but eight small folder commands.

## How it fits together

```
window (WebKit, WebView2 or WebKitGTK)
  index.html + app.js        pick a folder, list its notes
  editor.html                the browser editor's page (packages/claude-code/page)
    app-editor.js            answers the page's /api/ calls (src/app-api.ts)
      core storage           workspaceStorage (packages/core/src/workspace-storage.ts)
        tauriFiles           the folder commands, through Tauri's invoke (src/tauri-files.ts)
Rust (src-tauri/)
  lib.rs                     the window, the picked folder, the nine commands
  place.rs                   every path checked to stay inside the folder
  gh.rs                      the gh calls allowed, and gh run with no shell
```

## The source, `src/`

- `app-api.ts`: `appFetch`, a `fetch` that answers the editor's `/api/` calls from the folder's notes.
  - A note's id is its path in the folder.
  - A write names the version it was typed against. It is refused (409) when the note changed, with the note as it now
    is, and what was sent is kept as the note's draft.
  - The change stream sends the note, then reads it again every 2 seconds (`FOLLOW_EVERY_MS`) for changes made by
    other programs.
  - An export goes beside the note. Its files are written as new files, never over a file (`saveNew`).
  - Earlier versions and GitHub review items are refused in words for now (`app.not-yet`).
- `tauri-files.ts`: `tauriFiles` and `tauriStorage`. The core's workspace storage over the folder commands. Also
  `tauriSaveNew`, which writes an export. `invoke` is handed in, so nothing here imports Tauri.
- `app-start.ts`: the first page. Pick a folder with the system's dialog, then each note is a link into the editor.
- `app-editor.ts`: runs before the editor's page. It installs `appFetch` and adds a link back to the list. On a
  computer it also adds the GitHub button for the open note.
- `app-github.ts`: the GitHub button and its panel (spec §48). The panel keeps the picked repositories, the branch and
  the highest classification in the window's storage, never in a note. In the editor it sends the open note, or asks
  for a review as a pull request. The show-before-send screen (`showOutgoing`) comes first: Cancel has the focus, and
  Escape cancels. The core does the rest (`sendNoteToRepo`, `askRepoReview` in core/src/github-repo-send.ts).
- `tauri-gh.ts`: `tauriGh`, gh run through the app's `run_gh` command. A call off the list is refused before it
  reaches the Rust.
- `tauri-mesh.ts`: `dialDevice` and `listenForDevice`, the mesh commands as a sync `Channel`. Sends go in order, and the
  channel closes when the Rust says the connection ended.

## Sharing, in `src/`

- `app-share.ts`: the Share button and its panel (ES§45, `board_access`). One press starts a shared vault. The keys are
  made on this device. The panel shows only the public key and a fingerprint to read aloud. Another device is
  trusted by pasting its public key. Nothing is sent from the panel.
- `app-share-invite.ts`: the invitation. The owner picks a trusted device, a role and a board, and gets text sealed for
  that device alone. A guest pastes it and reads the inviter's fingerprint first. Joining is a press of its own.
- `app-share-link.ts`: where the link runs. The person writes the address this device listens at and the other
  device's address, both on their mesh VPN. They are kept with the keys. Nothing is sent from this screen.
- `app-share-dom.ts`: the small helpers of the Share screens.
- `app-share-keeper.ts`: `indexedKeeper`. The keys are kept in the window's IndexedDB, on this device only. The private
  key is unexportable, and the vault key is kept sealed for this device itself.

## The Rust, `src-tauri/`

- Twenty-five commands, and no others. These are the folder commands (`pick_folder`, `own_folder`, `read_dir`, `read_text`,
  `write_text`, `remove_file`, `make_dir`, `write_new`, `pick_target`, `swap_folders`), `run_gh`, six `mesh_` ones and
  eight `crdt_` ones. The same twenty-five are named in `lib.rs`, `build.rs` and `capabilities/default.json`. A test
  holds the three lists together.
- `gh.rs` holds `run_gh`'s list of allowed calls: only `gh api --hostname github.com`, for the seven calls the core's
  repository host makes. Anything else is refused before gh starts. `cargo test` checks the list against
  `packages/core/test/fixtures/gh-calls.json`, the cases the core checks too.
- gh is started by its own path, found where it installs or on the PATH. Its arguments go as a list, with no shell,
  and the body on standard input. A call is stopped after 60 seconds or 8 MiB of output. The app holds no token: gh
  signs in itself. A phone runs no gh.
- `mesh.rs` carries bytes between the owner's devices over a mesh VPN. Its commands: listen, accept, dial, send,
  receive and close.
- It opens private addresses only: the home network, loopback and the mesh VPN ranges. A public address, 0.0.0.0 and a
  name are refused. So is a device that reaches in from a public address.
- A message is whole, after its length, and at most 16 MiB. The messages are sealed in JavaScript, so the Rust holds no
  key. `cargo test` checks all of it.
- `place.rs` refuses any path that climbs out, starts at a root, names a hidden part (such as `.git`), or reaches
  outside through a link. A note is written to a new file beside it, then renamed over it.
- `write_new` writes an export only as new files. A name taken gets the next number. All of the files or none.
- The window's policy (`tauri.conf.json`) allows only the app's own pages and Tauri's calls. No other origin.
- `thoughtknot-app <folder>` opens that folder without asking. The end-to-end check uses this.
- The crates are pinned to exact versions. `Cargo.lock` is committed.
- `crdt.rs` keeps the notes as Automerge texts, because the window may not run WebAssembly. Its commands open a note,
  read its text, edit it, merge in records, ask whether it was ever a text, and make and find anchors. Bytes cross as
  hexadecimal text. It writes the same bytes as the JavaScript build, which a shared fixture checks.

## Build and run

```
npm run build --workspace packages/app        # the window's files, into packages/app/dist
cd packages/app/src-tauri && cargo build      # first: see below
cd packages/app/src-tauri && cargo test       # the folder checks
cd packages/app/src-tauri && cargo run -- path/to/notes
```

Build before `cargo test` on a fresh checkout. `cargo test` compiles the library twice at once, and both copies pack
the window's files into one folder. One can take in a file the other is still writing, such as `page.js`. The app
then cannot unpack it, and serves its first page in its place.

On Linux the build needs WebKitGTK 4.1 (`libwebkit2gtk-4.1-dev`). The tests in `test/` run with the rest of the
JavaScript suite and need no Rust. `test/app-window.js` runs the built window in a DOM, over a real folder. The
first-run journey (`test/repository/journey-app.js`) and the WCAG check (`test/wcag.test.js`) use it.

## The real app, tested

`test/standalone-app.test.js` starts the built app on a folder and drives it through tauri-driver. It lists the
notes, opens one, draws it, writes an edit to disk, and checks that the window refuses any other address. It skips
with one line where there is no app, driver or display.

The desktop app workflow (`.github/workflows/desktop-app.yml`) builds the app and runs `cargo test` on Linux, macOS
and Windows. On Linux it also runs that test under a virtual display. tauri-driver has no macOS driver, so macOS and
Windows are built and tested, not driven.

```
cargo install tauri-driver --locked --version 2.1.0
cd packages/app/src-tauri && cargo build && cd ../../..
xvfb-run -a npm run test:ai -- test/standalone-app.test.js
```

## On a phone or tablet

The same shell is built for Android, and for the iPhone and iPad (spec §40). Only the folder differs.

- A phone has no folder dialog. The app keeps its notes in its own Documents folder, made at first launch and open
  from the start. `own_folder` names it; on a computer it gives none.
- On an iPhone or iPad, the Files app shows that folder under On My iPhone (`Info.ios.plist`). On Android, it is the
  app's own folder on the device's storage.
- The first page lists the notes, with nothing to pick. Its button, New note, makes a note with an empty graph and
  opens it. A name already taken gets the next number, so no note is written over.
- The folder dialog plug-in is built for computers only (`Cargo.toml`).
- The vault key (packages/sync/src/keys.ts) is made on the phone at first launch. It is kept in the phone's own secure
  store, never in the app. The app's own plug-in does it, in `src-tauri/keeper/`:
  - Android (`Keeper.kt`): 32 random bytes, sealed by a key that lives in the Android Keystore and cannot leave it. Only
    the sealed copy is written, in the app's storage that is never backed up. A copy that cannot be opened is never
    written over.
  - iPhone and iPad (`KeeperPlugin.swift`): in the Keychain, for this device only. It stays through a reinstall, so a
    signing expiry means only reinstalling.
  - The window may not ask for the key yet: the capability does not allow `vault_key`. Sync allows it when it joins
    the app (W30). On a computer the command says it keeps none yet.
  - Its tests run on an Android emulator in the phone app workflow (`keeper/android/src/androidTest`).
- The phone app's id is `app.thoughtknot.mobile` (`tauri.android.conf.json`, `tauri.ios.conf.json`).

The phone and tablet app workflow (`.github/workflows/mobile-app.yml`) builds both on each change:

- Android: a debug APK for 64-bit ARM phones and tablets, kept as a download of the run. Install it by hand on a phone
  that allows apps from outside the Play Store.
- iPhone and iPad: built for the simulator, with signing switched off. A build for a real device waits for Roger's
  Apple account (docs/app-signing.md).

Tauri writes the Android Studio and Xcode projects into `src-tauri/gen/` at the start of each build. They are never
committed. To build on your own computer, with the Android SDK and NDK, or with Xcode:

```
npm run build --workspace packages/app
cd packages/app/src-tauri && cargo tauri android init && cargo tauri android build --debug --apk --target aarch64
cd packages/app/src-tauri && cargo tauri ios init && cargo tauri ios dev     # the simulator
```

## Installers

The same workflow builds an installer on each system and keeps it as a download of the run:

- macOS: a `.dmg`;
- Windows: an NSIS setup `.exe`;
- Linux: a `.deb`.

They are signed where Roger has set the keys: macOS signed and notarised, and the `.deb` with a `.asc` GPG signature
beside it. Windows is not signed (Roger, 23 Oct 2026). A pull request build is never signed. How to get each key, and
what it costs: [docs/app-signing.md](../../docs/app-signing.md).

An unsigned app makes macOS and Windows warn the first time it opens. On a Mac, right-click the app and choose Open.
On Windows, choose "More info", then "Run anyway". The `.deb` uses the system's own WebKitGTK and carries none of it.
A Linux package that carries WebKitGTK waits for the licence check named in `licences/bundled.json`.

```
cargo install tauri-cli --locked --version 2.12.4
npm run build --workspace packages/app
cd packages/app/src-tauri && cargo tauri build      # the installer, in target/release/bundle/, unsigned
```
