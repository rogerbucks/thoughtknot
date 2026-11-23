// The AI plug-in's commands, each allowed by name in the app's capability (deny by default), and its phone code: Swift
// for the iPhone and iPad. Android has none yet, so its commands say so.
const COMMANDS: &[&str] = &[
    "ai_here",
    "ai_key_set",
    "ai_key_has",
    "ai_key_get",
    "ai_key_forget",
    "ai_request",
    "ai_on_device_ask",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).ios_path("ios").build();
}
