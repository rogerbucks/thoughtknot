// The desktop app (spec §41, standalone_app): one window, and the notes of one folder the person picks. The window
// runs the browser editor's page, which reads and writes notes through the ten folder commands below, and sends a
// note to GitHub through the one gh command, and nothing else.
// - Nothing is fetched: the window's pages come from inside the app, and its policy allows no other origin.
// - Every path a command takes is relative to the picked folder. A path that climbs out (`..`), starts at a root, names
//   a hidden part (`.git`) or reaches outside through a link is refused before anything is read or written.
// - A note is written whole: to a new file beside it, then renamed over it. So a failed write leaves the note as it was.
// - An export is only ever new files: never written over a file already there.
// - One program may be started: the person's own gh, for the calls a GitHub repository needs and no other (gh.rs).
// - Bytes between the owner's devices over a mesh VPN (mesh.rs): listen, dial, send and receive whole messages on
//   private addresses only. The messages are sealed before they get here, so Rust holds no key.
// - What the machine has for sharing (found.rs): the one command only looks, for a mesh VPN address, and changes nothing.
// - The notes as Automerge texts (crdt.rs): open, edit, merge, ask the history and who made each change, anchor. They are kept in Rust because the
//   window may not run WebAssembly. Bytes cross as hexadecimal text, and no record leaves unsealed.
// - Moving the notes to another folder (spec §55, storage_user_choice): the person picks a second folder, the target.
//   The folder commands reach it only when asked to (`target`). Once every note is copied and checked, the two swap.
//   So the old folder is the target, and its copies are removed only when the person says so.
// On a phone or tablet (spec §40, android_app and ios_app) there is no folder dialog. The app keeps its notes in its own
// documents folder instead, open from the start: `own_folder` names it, and `pick_folder` gives it again.
mod crdt;
mod found;
mod gh;
mod mesh;
mod place;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::State;
#[cfg(mobile)]
use tauri::{Manager, Runtime};
#[cfg(desktop)]
use tauri_plugin_dialog::DialogExt;

/// The folder the person picked; none until they pick one.
#[derive(Default)]
struct Folder(Mutex<Option<PathBuf>>);

impl Folder {
    fn root(&self) -> Result<PathBuf, String> {
        self.0
            .lock()
            .map_err(|_| "the folder is unreadable".to_string())?
            .clone()
            .ok_or_else(|| "no folder is open".to_string())
    }
}

/// The second folder notes are moved to, once the person picks one; and, after the move, the folder they came from.
#[derive(Default)]
struct Target(Mutex<Option<PathBuf>>);

impl Target {
    fn root(&self) -> Result<PathBuf, String> {
        self.0
            .lock()
            .map_err(|_| "the folder is unreadable".to_string())?
            .clone()
            .ok_or_else(|| "no folder to move to is picked".to_string())
    }
}

/// The folder a command reaches: the picked one, or with `target` the folder notes are moved to.
fn root_of(folder: &Folder, to: &Target, target: Option<bool>) -> Result<PathBuf, String> {
    if target == Some(true) {
        to.root()
    } else {
        folder.root()
    }
}

/// Asks the person for a folder to move the notes to, with the system's own dialog. Its name, or none when they
/// cancelled. The open folder, or one inside it or around it, is refused, so a move never copies a note onto itself.
#[cfg(desktop)]
#[tauri::command]
async fn pick_target(
    app: tauri::AppHandle,
    folder: State<'_, Folder>,
    to: State<'_, Target>,
) -> Result<Option<String>, String> {
    let open = folder.root()?;
    let Some(picked) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let real = path.canonicalize().map_err(|e| e.to_string())?;
    if real.starts_with(&open) || open.starts_with(&real) {
        return Err("choose a folder outside the one open now".to_string());
    }
    let name = name_of(&real);
    *to.0
        .lock()
        .map_err(|_| "the folder is unreadable".to_string())? = Some(real);
    Ok(Some(name))
}

/// A phone keeps its notes in its own folder alone: there is nowhere else to move them.
#[cfg(mobile)]
#[tauri::command]
async fn pick_target() -> Result<Option<String>, String> {
    Err("a phone keeps its notes in the app's own folder".to_string())
}

/// After a checked move: the folder moved to becomes the open one, and the old one the target. Gives the new name.
#[tauri::command]
fn swap_folders(folder: State<'_, Folder>, to: State<'_, Target>) -> Result<String, String> {
    let mut open = folder
        .0
        .lock()
        .map_err(|_| "the folder is unreadable".to_string())?;
    let mut other =
        to.0.lock()
            .map_err(|_| "the folder is unreadable".to_string())?;
    if other.is_none() {
        return Err("no folder to move to is picked".to_string());
    }
    std::mem::swap(&mut *open, &mut *other);
    Ok(open.as_deref().map(name_of).unwrap_or_default())
}

/// Asks the person for a folder of notes, with the system's own dialog. Its name, or none when they cancelled.
#[cfg(desktop)]
#[tauri::command]
async fn pick_folder(
    app: tauri::AppHandle,
    folder: State<'_, Folder>,
) -> Result<Option<String>, String> {
    let Some(picked) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let real = path.canonicalize().map_err(|e| e.to_string())?;
    let name = name_of(&real);
    *folder
        .0
        .lock()
        .map_err(|_| "the folder is unreadable".to_string())? = Some(real);
    Ok(Some(name))
}

/// A phone has no folder dialog: the app's own folder, already open, is the one there is.
#[cfg(mobile)]
#[tauri::command]
async fn pick_folder(folder: State<'_, Folder>) -> Result<Option<String>, String> {
    Ok(Some(name_of(&folder.root()?)))
}

/// The name of the folder the app keeps its notes in on a phone or tablet; none on a computer, where the person picks.
#[tauri::command]
fn own_folder(folder: State<'_, Folder>) -> Result<Option<String>, String> {
    if cfg!(mobile) {
        Ok(Some(name_of(&folder.root()?)))
    } else {
        Ok(None)
    }
}

/// A folder's last part, as the person knows it.
fn name_of(path: &std::path::Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Each entry of a folder inside the picked one, or the target: its name, and whether it is a folder. `""` is the top.
#[tauri::command]
fn read_dir(
    path: String,
    target: Option<bool>,
    folder: State<'_, Folder>,
    to: State<'_, Target>,
) -> Result<Vec<(String, bool)>, String> {
    place::read_dir(&root_of(&folder, &to, target)?, &path)
}

/// A note's text. The error is `ENOENT` when there is no file.
#[tauri::command]
fn read_text(
    path: String,
    target: Option<bool>,
    folder: State<'_, Folder>,
    to: State<'_, Target>,
) -> Result<String, String> {
    place::read_text(&root_of(&folder, &to, target)?, &path)
}

/// Writes a note whole: a new file beside it, renamed over it.
#[tauri::command]
fn write_text(
    path: String,
    text: String,
    target: Option<bool>,
    folder: State<'_, Folder>,
    to: State<'_, Target>,
) -> Result<(), String> {
    place::write_text(&root_of(&folder, &to, target)?, &path, &text)
}

#[tauri::command]
fn remove_file(
    path: String,
    target: Option<bool>,
    folder: State<'_, Folder>,
    to: State<'_, Target>,
) -> Result<(), String> {
    place::remove_file(&root_of(&folder, &to, target)?, &path)
}

/// Makes a folder and the folders above it, inside the picked one.
#[tauri::command]
fn make_dir(
    path: String,
    target: Option<bool>,
    folder: State<'_, Folder>,
    to: State<'_, Target>,
) -> Result<(), String> {
    place::make_dir(&root_of(&folder, &to, target)?, &path)
}

/// Writes an export's files as new files in a folder inside the picked one. Gives the names written.
#[tauri::command]
fn write_new(
    into: String,
    files: Vec<(String, Vec<u8>)>,
    folder: State<'_, Folder>,
) -> Result<Vec<String>, String> {
    place::write_new(&folder.root()?, &into, &files)
}

/// Runs the person's own gh for one call to a GitHub repository they picked (spec §48, github_repo_access). Only the
/// calls on the list in gh.rs are run, by gh's own path, with no shell. The app holds no token: gh signs in itself.
#[cfg(desktop)]
#[tauri::command]
async fn run_gh(args: Vec<String>, input: Option<String>) -> Result<gh::GhOutput, String> {
    if let Some(why) = gh::refusal(&args, input.as_deref()) {
        return Err(why.to_string());
    }
    tauri::async_runtime::spawn_blocking(move || gh::run(&args, input.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

/// A phone or tablet has no gh: sending to GitHub is a computer's alone.
#[cfg(mobile)]
#[tauri::command]
async fn run_gh(args: Vec<String>, input: Option<String>) -> Result<gh::GhOutput, String> {
    let _ = (args, input);
    Err("computer-only".to_string())
}

/// Runs `work` on a thread of its own, so a wait for the network never holds the window.
async fn off<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| e.to_string())?
}

/// Listens on a private address of the mesh VPN or the home network (mesh.rs). Returns the listener and its address.
#[tauri::command]
async fn mesh_listen(
    mesh: State<'_, Arc<mesh::Mesh>>,
    address: String,
) -> Result<(u32, String), String> {
    let mesh = mesh.inner().clone();
    off(move || mesh.listen(&address)).await
}

/// Waits for one device to reach the listener, and returns the connection.
#[tauri::command]
async fn mesh_accept(mesh: State<'_, Arc<mesh::Mesh>>, listener: u32) -> Result<u32, String> {
    let mesh = mesh.inner().clone();
    off(move || mesh.accept(listener)).await
}

/// Dials a private address, and returns the connection.
#[tauri::command]
async fn mesh_dial(
    mesh: State<'_, Arc<mesh::Mesh>>,
    address: String,
    secs: u64,
) -> Result<u32, String> {
    let mesh = mesh.inner().clone();
    off(move || mesh.dial(&address, secs)).await
}

/// Sends one whole message, already sealed, on a connection.
#[tauri::command]
async fn mesh_send(
    mesh: State<'_, Arc<mesh::Mesh>>,
    connection: u32,
    message: Vec<u8>,
) -> Result<(), String> {
    let mesh = mesh.inner().clone();
    off(move || mesh.send(connection, &message)).await
}

/// The next message on a connection, waiting a moment: nothing when none came, an error once it is closed.
#[tauri::command]
async fn mesh_receive(
    mesh: State<'_, Arc<mesh::Mesh>>,
    connection: u32,
    ms: u64,
) -> Result<Option<Vec<u8>>, String> {
    let mesh = mesh.inner().clone();
    off(move || mesh.receive(connection, ms)).await
}

/// Closes a connection or a listener.
#[tauri::command]
async fn mesh_close(mesh: State<'_, Arc<mesh::Mesh>>, id: u32) -> Result<(), String> {
    let mesh = mesh.inner().clone();
    off(move || Ok(mesh.close(id))).await
}

/// Opens a note from its records, as the window's sync engine needs it. Notes are Automerge texts kept in Rust, because
/// the window may not run WebAssembly. Bytes cross as hexadecimal text. The note starts as `text` when it has no record.
#[tauri::command]
async fn crdt_open(
    notes: State<'_, crdt::Notes>,
    note: String,
    actor: String,
    records: Vec<String>,
    text: String,
) -> Result<crdt::Opened, String> {
    notes.open(&note, &actor, &records, &text)
}

/// The text of an open note.
#[tauri::command]
async fn crdt_text(notes: State<'_, crdt::Notes>, note: String) -> Result<String, String> {
    notes.text(&note)
}

/// Replaces `from` to `to` of an open note by `insert`; the change made, to keep in the store.
#[tauri::command]
async fn crdt_splice(
    notes: State<'_, crdt::Notes>,
    note: String,
    from: usize,
    to: usize,
    insert: String,
    message: String,
    time: i64,
) -> Result<String, String> {
    if to < from {
        return Err("the end of the edit is before its start".into());
    }
    notes.splice(&note, from, to, &insert, &message, time)
}

/// Merges the records an open note lacks; nothing when none is new.
#[tauri::command]
async fn crdt_merge(
    notes: State<'_, crdt::Notes>,
    note: String,
    records: Vec<String>,
) -> Result<Option<crdt::Joined>, String> {
    notes.merge(&note, &records)
}

/// Whether an open note was ever `text`.
#[tauri::command]
async fn crdt_has_been(
    notes: State<'_, crdt::Notes>,
    note: String,
    text: String,
) -> Result<bool, String> {
    notes.has_been(&note, &text)
}

/// An anchor at `place` of an open note, which stays on its character.
#[tauri::command]
async fn crdt_anchor(
    notes: State<'_, crdt::Notes>,
    note: String,
    place: usize,
) -> Result<String, String> {
    notes.anchor(&note, place)
}

/// The mesh VPN addresses of this machine, each with the name to say it by. It only looks (found.rs).
#[tauri::command]
async fn machine_found() -> Result<Vec<(String, String)>, String> {
    tauri::async_runtime::spawn_blocking(found::vpns)
        .await
        .map_err(|e| e.to_string())
}

/// Who made each change of an open note: the message kept with each, oldest first.
#[tauri::command]
async fn crdt_history(notes: State<'_, crdt::Notes>, note: String) -> Result<Vec<String>, String> {
    notes.history(&note)
}

/// Where an anchor is now in an open note.
#[tauri::command]
async fn crdt_place(
    notes: State<'_, crdt::Notes>,
    note: String,
    anchor: String,
) -> Result<usize, String> {
    notes.place(&note, &anchor)
}

/// The folder named as the first argument, such as `thoughtknot ~/Notes`, when it is one.
#[cfg(desktop)]
fn folder_named() -> Option<PathBuf> {
    let real = PathBuf::from(std::env::args_os().nth(1)?)
        .canonicalize()
        .ok()?;
    real.is_dir().then_some(real)
}

/// The app's own documents folder on a phone or tablet, made at first launch: the notes live there.
/// - Android: the app's Documents folder on the device's storage, which the app alone may write.
/// - iPhone and iPad: the app's Documents folder, which the Files app shows under On My iPhone (UIFileSharingEnabled).
#[cfg(mobile)]
fn own_documents<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app.path().document_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    dir.canonicalize().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_keeper::init())
        .manage(Arc::new(mesh::Mesh::default()))
        .manage(crdt::Notes::default());
    #[cfg(desktop)]
    let app = app
        .plugin(tauri_plugin_dialog::init())
        .manage(Folder(Mutex::new(folder_named())))
        .manage(Target::default());
    #[cfg(mobile)]
    let app = app
        .manage(Folder::default())
        .manage(Target::default())
        .setup(|app| {
            let dir = own_documents(app.handle())?;
            *app.state::<Folder>()
                .0
                .lock()
                .map_err(|_| "the folder is unreadable")? = Some(dir);
            Ok(())
        });
    app.invoke_handler(tauri::generate_handler![
        pick_folder,
        own_folder,
        read_dir,
        read_text,
        write_text,
        remove_file,
        make_dir,
        write_new,
        pick_target,
        swap_folders,
        run_gh,
        mesh_listen,
        mesh_accept,
        mesh_dial,
        mesh_send,
        mesh_receive,
        mesh_close,
        crdt_open,
        crdt_text,
        crdt_splice,
        crdt_merge,
        crdt_has_been,
        crdt_anchor,
        crdt_place,
        crdt_history,
        machine_found
    ])
    .run(tauri::generate_context!())
    .expect("the app could not start");
}
