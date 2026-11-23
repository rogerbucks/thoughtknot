// AI on the iPhone and iPad (editor spec ES§19, app_ai_host). The window decides everything about a send: the core makes
// the request, shows it, and sends it only after the person taps Send. This plug-in only carries it out, on the phone:
// - a model's key, kept in the Keychain for this device only, never in the vault or the app's settings
//   (app_ai_key_keychain, ios/Sources/AiKeys.swift);
// - a request the person sent, to the address they set up, over https, or http to this device itself
//   (ios/Sources/Requests.swift). Anything else is refused here, before Swift is asked;
// - Apple's on-device model, where the phone has one (app_ai_on_device, ios/Sources/OnDevice.swift). Nothing sent to it
//   leaves the device.
// A computer and an Android phone have none of this yet: each command says so.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::plugin::{Builder, TauriPlugin};
#[cfg(target_os = "ios")]
use tauri::Manager;
use tauri::Runtime;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_ai);

/// What a device without AI says.
pub const NOT_HERE: &str = "AI is set up on an iPhone or iPad only, for now";

/// The most a request's body may be, in bytes: 16 MiB, as the mesh's messages.
pub const BODY_MOST: usize = 16 * 1024 * 1024;

/// Whether this device hosts AI, and what its on-device model says: `available`, why not, or `none`.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Here {
    pub host: bool,
    pub on_device: String,
}

#[derive(Serialize, Deserialize)]
struct Named {
    name: String,
}

#[derive(Serialize, Deserialize)]
struct Keep {
    name: String,
    key: String,
}

#[derive(Serialize, Deserialize)]
struct Has {
    has: bool,
}

#[derive(Serialize, Deserialize)]
struct Found {
    key: Option<String>,
}

/// A request as the window hands it over, already shown to the person and said yes to.
#[derive(Serialize, Deserialize, Clone)]
pub struct Request {
    pub url: String,
    pub method: String,
    pub headers: HashMap<String, String>,
    pub body: String,
}

/// What came back: the status and the body as text.
#[derive(Serialize, Deserialize)]
pub struct Reply {
    pub status: u16,
    pub text: String,
}

#[derive(Serialize, Deserialize)]
struct Ask {
    instructions: String,
    prompt: String,
}

#[derive(Serialize, Deserialize)]
struct Answer {
    text: String,
}

/// Why a request may not go, or None when it may. A POST with a body, or a GET with none (Test, which sends no note).
/// It goes over https, or over http only to this device itself. No user name or password rides in the address.
pub fn refused(r: &Request) -> Option<String> {
    match r.method.as_str() {
        "POST" => {}
        "GET" if r.body.is_empty() => {}
        "GET" => return Some("a GET carries no body".into()),
        other => return Some(format!("{other} is not a request this app sends")),
    }
    if r.body.len() > BODY_MOST {
        return Some("the request is over 16 MiB".into());
    }
    let rest = if let Some(rest) = r.url.strip_prefix("https://") {
        rest
    } else if let Some(rest) = r.url.strip_prefix("http://") {
        let host = rest.split(['/', ':', '?', '#']).next().unwrap_or("");
        let local = host == "localhost" || host == "127.0.0.1" || rest.starts_with("[::1]");
        if !local {
            return Some("only this device itself is reached over http: use https".into());
        }
        rest
    } else {
        return Some("the address is not https".into());
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    if authority.is_empty() || authority.contains('@') || authority.contains(char::is_whitespace) {
        return Some("the address names no plain host".into());
    }
    None
}

/// The phone code's handle, through which the commands ask it.
#[cfg(target_os = "ios")]
struct Phone<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[cfg(target_os = "ios")]
fn phone<R: Runtime, A: Serialize, T: serde::de::DeserializeOwned>(
    app: &tauri::AppHandle<R>,
    method: &str,
    args: A,
) -> Result<T, String> {
    app.state::<Phone<R>>()
        .0
        .run_mobile_plugin::<T>(method, args)
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "ios"))]
fn phone<R: Runtime, A: Serialize, T: serde::de::DeserializeOwned>(
    _app: &tauri::AppHandle<R>,
    _method: &str,
    _args: A,
) -> Result<T, String> {
    Err(NOT_HERE.to_string())
}

/// Whether this device hosts AI, and whether its own model can be asked.
#[tauri::command]
async fn ai_here<R: Runtime>(app: tauri::AppHandle<R>) -> Result<Here, String> {
    if cfg!(target_os = "ios") {
        phone(&app, "here", ())
    } else {
        Ok(Here {
            host: false,
            on_device: "none".into(),
        })
    }
}

/// Keeps a model's key in the Keychain under its name, replacing one kept before.
#[tauri::command]
async fn ai_key_set<R: Runtime>(app: tauri::AppHandle<R>, name: String, key: String) -> Result<(), String> {
    if name.trim().is_empty() || key.is_empty() {
        return Err("a key needs a name and a value".into());
    }
    phone(&app, "keySet", Keep { name, key })
}

/// Whether a key is kept under this name: the key itself is not read.
#[tauri::command]
async fn ai_key_has<R: Runtime>(app: tauri::AppHandle<R>, name: String) -> Result<bool, String> {
    phone::<R, Named, Has>(&app, "keyHas", Named { name }).map(|h| h.has)
}

/// The key kept under this name, read only as a send the person said yes to goes.
#[tauri::command]
async fn ai_key_get<R: Runtime>(app: tauri::AppHandle<R>, name: String) -> Result<Option<String>, String> {
    phone::<R, Named, Found>(&app, "keyGet", Named { name }).map(|f| f.key)
}

/// Forgets the key kept under this name.
#[tauri::command]
async fn ai_key_forget<R: Runtime>(app: tauri::AppHandle<R>, name: String) -> Result<(), String> {
    phone(&app, "keyForget", Named { name })
}

/// Sends one request the window made and the person said yes to, and gives back its status and text.
#[tauri::command]
async fn ai_request<R: Runtime>(app: tauri::AppHandle<R>, request: Request) -> Result<Reply, String> {
    if let Some(why) = refused(&request) {
        return Err(why);
    }
    phone(&app, "request", request)
}

/// Asks the phone's own model, on the device: nothing leaves it.
#[tauri::command]
async fn ai_on_device_ask<R: Runtime>(
    app: tauri::AppHandle<R>,
    instructions: String,
    prompt: String,
) -> Result<String, String> {
    phone::<R, Ask, Answer>(&app, "ask", Ask { instructions, prompt }).map(|a| a.text)
}

/// The AI plug-in. On an iPhone or iPad it registers the Swift code; elsewhere its commands say there is none.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("ai")
        .invoke_handler(tauri::generate_handler![
            ai_here,
            ai_key_set,
            ai_key_has,
            ai_key_get,
            ai_key_forget,
            ai_request,
            ai_on_device_ask
        ])
        .setup(|_app, _api| {
            #[cfg(target_os = "ios")]
            {
                let handle = _api.register_ios_plugin(init_plugin_ai)?;
                _app.manage(Phone(handle));
            }
            Ok(())
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(method: &str, url: &str, body: &str) -> Request {
        Request {
            url: url.into(),
            method: method.into(),
            headers: HashMap::new(),
            body: body.into(),
        }
    }

    #[test]
    fn a_post_over_https_goes() {
        assert_eq!(refused(&req("POST", "https://box.tail1234.ts.net/v1/chat/completions", "{}")), None);
        assert_eq!(refused(&req("GET", "https://api.example.com/v1/models", "")), None);
    }

    #[test]
    fn http_goes_only_to_this_device() {
        assert_eq!(refused(&req("POST", "http://localhost:11434/v1", "{}")), None);
        assert_eq!(refused(&req("POST", "http://127.0.0.1:1234/v1", "{}")), None);
        assert!(refused(&req("POST", "http://box.tail1234.ts.net/v1", "{}")).is_some());
        assert!(refused(&req("POST", "http://localhost.evil.com/v1", "{}")).is_some());
        assert!(refused(&req("POST", "ftp://host/v1", "{}")).is_some());
    }

    #[test]
    fn other_methods_a_get_with_a_body_and_a_user_in_the_address_are_refused() {
        assert!(refused(&req("PUT", "https://host/v1", "{}")).is_some());
        assert!(refused(&req("GET", "https://host/v1", "{}")).is_some());
        assert!(refused(&req("POST", "https://me:pw@host/v1", "{}")).is_some());
        assert!(refused(&req("POST", "https:///v1", "{}")).is_some());
    }

    #[test]
    fn a_body_over_16_mib_is_refused() {
        let big = "x".repeat(BODY_MOST + 1);
        assert!(refused(&req("POST", "https://host/v1", &big)).is_some());
    }
}
