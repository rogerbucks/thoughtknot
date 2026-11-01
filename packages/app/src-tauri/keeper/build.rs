// The keeper's one command, allowed by name in the app's capability (deny by default), and its phone code: Kotlin for
// Android, Swift for the iPhone and iPad.
const COMMANDS: &[&str] = &["vault_key"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
