// GitHub through the person's own gh (editor spec §48, github_repo_access): the one program the app may start.
// - Only the calls the core's repository host makes are run: `gh api --hostname github.com --method M address`, with
//   `--input -` exactly when M sends a body. Every other call is refused before anything starts. The core keeps the
//   same list (packages/core/src/github-repo-send.ts), and both are tested on one file of cases.
// - gh is started by its own path, never through a shell, with its arguments as a list. The body goes on its
//   standard input. The app holds no token: gh signs in itself.
// - gh is looked for in the places it installs to, then on the PATH. A setting never names the program.
// - A call that runs longer than `MOST_SECS`, or answers more than `MOST_BYTES`, is stopped.

/// What gh said: its exit code, and what it wrote.
#[derive(serde::Serialize, Debug)]
pub struct GhOutput {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// The longest a call may run, in seconds.
pub const MOST_SECS: u64 = 60;
/// The most gh may write, on each of its outputs, and the most the app sends it: 8 MiB.
pub const MOST_BYTES: usize = 8 * 1024 * 1024;

/// The words said when a call is not on the list.
pub const REFUSED: &str = "This app may not run that gh call, so nothing was sent.";

fn name_ok(p: &str) -> bool {
    !p.is_empty()
        && p.len() <= 100
        && p != "."
        && p != ".."
        && p.chars()
            .all(|c| c.is_ascii_alphanumeric() || "_.-".contains(c))
}

/// Whether `parts` are a branch's name: Git's rules, kept stricter, as the core's `isBranchName` keeps them.
fn branch_ok(parts: &[&str]) -> bool {
    let whole = parts.join("/");
    !parts.is_empty()
        && whole.len() <= 200
        && !whole.starts_with('-')
        && !whole.ends_with(".lock")
        && !whole.ends_with('.')
        && parts.iter().all(|p| {
            !p.is_empty()
                && !p.starts_with('.')
                && !p.contains("..")
                && p.chars()
                    .all(|c| c.is_ascii_alphanumeric() || "_.-".contains(c))
        })
}

/// A part of an address, %XX read back; None when it is not encoded as `encodeURIComponent` encodes.
fn decoded(p: &str) -> Option<Vec<u8>> {
    let bytes = p.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i];
        if c == b'%' {
            let hex = bytes.get(i + 1..i + 3)?;
            if !hex.iter().all(u8::is_ascii_hexdigit) {
                return None;
            }
            out.push(u8::from_str_radix(std::str::from_utf8(hex).ok()?, 16).ok()?);
            i += 3;
        } else if c.is_ascii_alphanumeric() || b"_.!~*'()-".contains(&c) {
            out.push(c);
            i += 1;
        } else {
            return None;
        }
    }
    Some(out)
}

/// Whether `parts` are a file's path, each part encoded, none `.` or `..`, even encoded.
fn path_ok(parts: &[&str]) -> bool {
    !parts.is_empty()
        && parts.iter().all(|p| match decoded(p) {
            Some(plain) => {
                !plain.is_empty()
                    && std::str::from_utf8(&plain).is_ok()
                    && plain != b"."
                    && plain != b".."
                    && !plain.contains(&b'/')
                    && !plain.contains(&b'\\')
            }
            None => false,
        })
}

/// Whether `rest` of an address after `repos/owner/name/`, with its `query`, is a call for `method`.
fn call_ok(method: &str, rest: &[&str], query: Option<&str>) -> bool {
    let (area, tail) = match rest.split_first() {
        Some((a, t)) => (*a, t),
        None => return false,
    };
    match method {
        "GET" => match (area, tail) {
            ("git", ["ref", "heads", branch @ ..]) => query.is_none() && branch_ok(branch),
            ("git", ["trees", branch @ ..]) => query == Some("recursive=1") && branch_ok(branch),
            ("contents", path) => match query.and_then(|q| q.strip_prefix("ref=")) {
                Some(r) => branch_ok(&r.split('/').collect::<Vec<_>>()) && path_ok(path),
                None => false,
            },
            _ => false,
        },
        _ if query.is_some() => false,
        "POST" => matches!((area, tail), ("git", ["refs"]) | ("pulls", [])),
        "PUT" | "DELETE" => area == "contents" && path_ok(tail),
        _ => false,
    }
}

/// Why gh may not be run with `args` and `input`, or None when it may.
pub fn refusal(args: &[String], input: Option<&str>) -> Option<&'static str> {
    let a: Vec<&str> = args.iter().map(String::as_str).collect();
    let (method, address, more) = match a.as_slice() {
        ["api", "--hostname", "github.com", "--method", m, address, more @ ..] => {
            (*m, *address, more)
        }
        _ => return Some(REFUSED),
    };
    let sends = method != "GET";
    let shape = if sends {
        more == ["--input", "-"]
    } else {
        more.is_empty()
    };
    if !shape || sends != input.is_some() || input.map_or(0, str::len) > MOST_BYTES {
        return Some(REFUSED);
    }
    let (path, query) = match address.split_once('?') {
        Some((p, q)) => (p, Some(q)),
        None => (address, None),
    };
    let parts: Vec<&str> = path.split('/').collect();
    match parts.as_slice() {
        ["repos", owner, name, rest @ ..]
            if name_ok(owner) && name_ok(name) && call_ok(method, rest, query) =>
        {
            None
        }
        _ => Some(REFUSED),
    }
}

#[cfg(desktop)]
pub use run::{find, run};

#[cfg(desktop)]
mod run {
    use super::{GhOutput, MOST_BYTES, MOST_SECS};
    use std::io::{Read, Write};
    use std::path::PathBuf;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    /// Where gh installs itself, looked in before the PATH: a GUI app on macOS is given a short PATH.
    fn known_places() -> Vec<PathBuf> {
        let mut places: Vec<PathBuf> = [
            "/opt/homebrew/bin/gh",
            "/usr/local/bin/gh",
            "/home/linuxbrew/.linuxbrew/bin/gh",
            "/usr/bin/gh",
            "/snap/bin/gh",
        ]
        .iter()
        .map(PathBuf::from)
        .collect();
        for (var, tail) in [
            ("ProgramFiles", "GitHub CLI\\gh.exe"),
            ("LOCALAPPDATA", "Programs\\GitHub CLI\\gh.exe"),
        ] {
            if let Some(dir) = std::env::var_os(var) {
                places.push(PathBuf::from(dir).join(tail));
            }
        }
        places
    }

    /// gh's own path: in a known place, else the first on the PATH. None when it is not installed.
    pub fn find() -> Option<PathBuf> {
        let exe = if cfg!(windows) { "gh.exe" } else { "gh" };
        let on_path = std::env::var_os("PATH")
            .map(|p| {
                std::env::split_paths(&p)
                    .map(|d| d.join(exe))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        known_places()
            .into_iter()
            .chain(on_path)
            .find(|p| p.is_absolute() && p.is_file())
    }

    /// Reads at most `MOST_BYTES` of an output, in its own thread, so a full pipe never holds gh up.
    fn reader<R: Read + Send + 'static>(from: R) -> std::thread::JoinHandle<Vec<u8>> {
        std::thread::spawn(move || {
            let mut kept = Vec::new();
            let _ = from.take(MOST_BYTES as u64 + 1).read_to_end(&mut kept);
            kept
        })
    }

    /// Runs gh with `args`, `input` on its standard input. The caller has checked the call (`super::refusal`).
    pub fn run(args: &[String], input: Option<&str>) -> Result<GhOutput, String> {
        let gh = find().ok_or("gh-missing")?;
        let mut command = Command::new(gh);
        command
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("GH_PROMPT_DISABLED", "1")
            .env("GH_NO_UPDATE_NOTIFIER", "1")
            .env("NO_COLOR", "1")
            .env_remove("GH_DEBUG")
            .env_remove("GH_HOST")
            .env_remove("GH_REPO");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        let mut child = command.spawn().map_err(|e| e.to_string())?;
        let mut stdin = child.stdin.take().ok_or("gh took no input")?;
        let body = input.unwrap_or("").as_bytes().to_vec();
        let writer = std::thread::spawn(move || {
            let _ = stdin.write_all(&body);
        });
        let out = reader(child.stdout.take().ok_or("gh gave no output")?);
        let err = reader(child.stderr.take().ok_or("gh gave no output")?);
        let started = Instant::now();
        let status = loop {
            if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                break status;
            }
            if started.elapsed() > Duration::from_secs(MOST_SECS) {
                let _ = child.kill();
                let _ = child.wait();
                return Err("gh took too long, so it was stopped".into());
            }
            std::thread::sleep(Duration::from_millis(25));
        };
        let _ = writer.join();
        let (stdout, stderr) = (
            out.join().unwrap_or_default(),
            err.join().unwrap_or_default(),
        );
        if stdout.len() > MOST_BYTES || stderr.len() > MOST_BYTES {
            return Err("gh answered more than the app reads, so it was not used".into());
        }
        Ok(GhOutput {
            code: status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&stdout).into_owned(),
            stderr: String::from_utf8_lossy(&stderr).into_owned(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The cases the core's tests read too, so the two lists of allowed calls stay one.
    const CASES: &str = include_str!("../../../core/test/fixtures/gh-calls.json");

    #[test]
    fn the_same_calls_as_the_core_are_run_and_refused() {
        let all: serde_json::Value = serde_json::from_str(CASES).unwrap();
        let cases = all["cases"].as_array().unwrap();
        assert!(cases.len() > 20);
        for case in cases {
            let args: Vec<String> = case["args"]
                .as_array()
                .unwrap()
                .iter()
                .map(|a| a.as_str().unwrap().to_string())
                .collect();
            let input = case["input"].as_str();
            let allowed = case["allowed"].as_bool().unwrap();
            assert_eq!(
                refusal(&args, input).is_none(),
                allowed,
                "gh {}",
                args.join(" ")
            );
        }
    }

    #[test]
    fn a_body_past_the_most_is_refused() {
        let args: Vec<String> = [
            "api",
            "--hostname",
            "github.com",
            "--method",
            "PUT",
            "repos/ada/graphs/contents/a.md",
            "--input",
            "-",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        assert!(refusal(&args, Some("{}")).is_none());
        assert!(refusal(&args, Some(&"x".repeat(MOST_BYTES + 1))).is_some());
    }

    #[test]
    fn gh_is_found_only_by_an_absolute_path_to_a_file() {
        if let Some(p) = find() {
            assert!(p.is_absolute() && p.is_file());
        }
    }
}
