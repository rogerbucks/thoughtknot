// The store of notes read in parts (spec ES§53, scale_parts_on_disk): a SQLite file in the app's own data folder on
// the device, never in the notes folder. The window reads a huge note a part at a time and puts its rows here, then asks
// for a page of rows at a time, so it holds only what is on screen. The store itself is in `store/` (thoughtknot-store).
// The file is opened at the first call. It is only a copy of what the notes say, so a file that cannot be read is made
// again (Store::open).
use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime};
use thoughtknot_store::Store;

/// The store's file, in the app's own data folder.
pub const FILE: &str = "parts-store.sqlite";

/// The store, opened at the first call.
#[derive(Default)]
pub struct Parts(Mutex<Option<Store>>);

impl Parts {
    /// Runs `f` on the store, opening its file first if this is the first call.
    pub fn with<R: Runtime, T>(
        &self,
        app: &AppHandle<R>,
        f: impl FnOnce(&mut Store) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut held = self.0.lock().map_err(|_| "the store is unreadable")?;
        if held.is_none() {
            let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
            *held = Some(Store::open(&dir.join(FILE))?);
        }
        match held.as_mut() {
            Some(store) => f(store),
            None => Err("the store did not open".into()),
        }
    }
}
