// The vault key on a phone or tablet (spec §40, android_app and ios_app; packages/sync/src/keys.ts). It is made on the
// device at first launch and kept in the device's own secure store, never in the app:
// - Android: sealed by a key that lives in the Android Keystore and cannot leave it. The sealed copy sits in the app's
//   own storage that is never backed up (src/main/java/Keeper.kt).
// - iPhone and iPad: in the Keychain, for this device only. A reinstall after a signing expiry keeps it
//   (ios/Sources/KeeperPlugin.swift).
// A computer keeps none yet: the command says so. The window may not ask for the key yet: its capability does not allow
// `vault_key` (deny by default). Sync between devices (W30) allows it when it joins the app.
use tauri::plugin::{Builder, TauriPlugin};
#[cfg(mobile)]
use tauri::Manager;
use tauri::Runtime;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_keeper);

/// The phone code's handle, through which the command asks it.
#[cfg(mobile)]
struct Phone<R: Runtime>(tauri::plugin::PluginHandle<R>);

/// What the phone code gives: the vault key's bytes.
#[cfg(mobile)]
#[derive(serde::Deserialize)]
struct Kept {
    key: Vec<u8>,
}

#[cfg(mobile)]
fn kept<R: Runtime>(phone: &Phone<R>) -> Result<Vec<u8>, String> {
    phone
        .0
        .run_mobile_plugin::<Kept>("vaultKey", ())
        .map(|kept| kept.key)
        .map_err(|e| e.to_string())
}

/// The vault key, as the device's secure store keeps it: made the first time it is asked for.
#[cfg(mobile)]
#[tauri::command]
async fn vault_key<R: Runtime>(app: tauri::AppHandle<R>) -> Result<Vec<u8>, String> {
    kept(&app.state::<Phone<R>>())
}

/// A computer keeps no vault key yet.
#[cfg(desktop)]
#[tauri::command]
async fn vault_key() -> Result<Vec<u8>, String> {
    Err("this computer keeps no vault key yet".to_string())
}

/// The keeper. On a phone it makes the vault key at first launch, so it is there before anything asks.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("keeper")
        .invoke_handler(tauri::generate_handler![vault_key])
        .setup(|_app, _api| {
            #[cfg(mobile)]
            {
                #[cfg(target_os = "android")]
                let handle =
                    _api.register_android_plugin("app.thoughtknot.keeper", "KeeperPlugin")?;
                #[cfg(target_os = "ios")]
                let handle = _api.register_ios_plugin(init_plugin_keeper)?;
                _app.manage(Phone(handle.clone()));
                // made beside the app's start, never holding it up
                std::thread::spawn(move || {
                    if let Err(why) = kept(&Phone(handle)) {
                        eprintln!("thoughtknot: the vault key was not made: {why}");
                    }
                });
            }
            Ok(())
        })
        .build()
}
