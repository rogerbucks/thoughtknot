// Where a command may reach: only inside the picked folder (spec §41, standalone_app). Each path is checked twice:
// - by its words: relative, `/`-separated, no `..`, no root, no hidden part such as `.git`;
// - on disk: the nearest part that exists, links followed, must still be inside the folder's real path.
use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Component, Path, PathBuf};

/// The path inside `root`, or why it may not be reached. `""` is `root` itself.
pub fn inside(root: &Path, path: &str) -> Result<PathBuf, String> {
    let refused = || format!("not a path inside the folder: {path:?}");
    if path.contains('\\') || path.contains('\0') {
        return Err(refused());
    }
    let mut full = root.to_path_buf();
    for part in Path::new(path).components() {
        match part {
            Component::Normal(name) if !name.to_string_lossy().starts_with('.') => full.push(name),
            _ => return Err(refused()),
        }
    }
    // the nearest part that is there, its links followed, is still inside
    let mut there = full.as_path();
    while !there.exists() {
        there = there.parent().ok_or_else(refused)?;
    }
    let real = there.canonicalize().map_err(|e| e.to_string())?;
    if !real.starts_with(root) {
        return Err(refused());
    }
    Ok(full)
}

/// Node's word for no such file, which the core reads as "no note there".
fn said(e: std::io::Error) -> String {
    if e.kind() == ErrorKind::NotFound {
        "ENOENT".to_string()
    } else {
        e.to_string()
    }
}

pub fn read_dir(root: &Path, path: &str) -> Result<Vec<(String, bool)>, String> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(inside(root, path)?).map_err(said)? {
        let entry = entry.map_err(said)?;
        let name = entry.file_name().to_string_lossy().into_owned();
        // a link is followed for its kind; one that leads nowhere is left out
        let Ok(meta) = fs::metadata(entry.path()) else {
            continue;
        };
        entries.push((name, meta.is_dir()));
    }
    Ok(entries)
}

pub fn read_text(root: &Path, path: &str) -> Result<String, String> {
    let file = inside(root, path)?;
    let bytes = fs::read(&file).map_err(said)?;
    String::from_utf8(bytes).map_err(|_| format!("not UTF-8 text: {path:?}"))
}

/// A part for a temp file's name that no other write shares: the process, the time and a count.
fn nonce() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNT: AtomicU64 = AtomicU64::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    let count = COUNT.fetch_add(1, Ordering::Relaxed);
    format!("{}-{nanos:x}-{count}", std::process::id())
}

pub fn write_text(root: &Path, path: &str, text: &str) -> Result<(), String> {
    write_text_with(root, path, text, &nonce())
}

/// Writes through a temp file made new: a name that is taken, a link among them, is refused and never opened.
fn write_text_with(root: &Path, path: &str, text: &str, nonce: &str) -> Result<(), String> {
    let file = inside(root, path)?;
    let parent = file.parent().ok_or("a note needs a folder")?;
    let name = file
        .file_name()
        .ok_or("a note needs a name")?
        .to_string_lossy();
    let temp = parent.join(format!(".{name}.thoughtknot-{nonce}"));
    let mut out = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(said)?;
    // a note that is there keeps its mode (an owner-only note stays owner-only)
    let mode = fs::metadata(&file).ok().map(|m| m.permissions());
    let written = (|| {
        if let Some(mode) = mode {
            out.set_permissions(mode)?;
        }
        out.write_all(text.as_bytes())?;
        out.sync_all()?;
        fs::rename(&temp, &file)
    })();
    if written.is_err() {
        let _ = fs::remove_file(&temp);
    }
    written.map_err(said)
}

pub fn remove_file(root: &Path, path: &str) -> Result<(), String> {
    fs::remove_file(inside(root, path)?).map_err(said)
}

pub fn make_dir(root: &Path, path: &str) -> Result<(), String> {
    let folder = inside(root, path)?;
    fs::create_dir_all(&folder).map_err(said)?;
    // made, then checked again on disk: a link raced in while it was made is refused
    inside(root, path).map(|_| ())
}

/// The endings an export has: the images, the data, and a companion note. A board's picture is kept with its own
/// ending too (`jpg`, `gif`, `webp`), as the core's rules name them (picture-keep.ts).
const ENDINGS: [&str; 9] = [
    "svg", "png", "gql", "csv", "graphml", "md", "jpg", "gif", "webp",
];

/// The most bytes a picture kept beside a note may hold, as in the core (PICTURE_MOST_BYTES).
const PICTURE_MOST_BYTES: u64 = 8_000_000;

/// Whether `bytes` start as a PNG, JPEG, GIF or WebP: the first bytes alone say, never the name. SVG is never one.
fn is_picture(bytes: &[u8]) -> bool {
    bytes.starts_with(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        || bytes.starts_with(&[0xff, 0xd8, 0xff])
        || (bytes.len() >= 6
            && bytes.starts_with(&[0x47, 0x49, 0x46, 0x38])
            && (bytes[4] == 0x37 || bytes[4] == 0x39)
            && bytes[5] == 0x61)
        || (bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP")
}

/// A picture kept beside a note, read back: a plain file (never a link) with a picture's ending, at most eight million
/// bytes, and only while its bytes are still a PNG, JPEG, GIF or WebP.
pub fn read_picture(root: &Path, path: &str) -> Result<Vec<u8>, String> {
    let name = path.rsplit('/').next().unwrap_or("");
    if !export_name(name)
        || !["png", "jpg", "gif", "webp"]
            .iter()
            .any(|e| name.ends_with(&format!(".{e}")))
    {
        return Err(format!("not a picture name: {path:?}"));
    }
    let file = inside(root, path)?;
    // the file itself, not what a link leads to: a link is refused, and its size is checked before it is read
    let meta = fs::symlink_metadata(&file).map_err(said)?;
    if !meta.is_file() || meta.len() > PICTURE_MOST_BYTES {
        return Err(format!("not a picture to read: {path:?}"));
    }
    let bytes = fs::read(&file).map_err(said)?;
    if bytes.len() as u64 > PICTURE_MOST_BYTES || !is_picture(&bytes) {
        return Err(format!("not a picture to read: {path:?}"));
    }
    Ok(bytes)
}

/// Whether `name` is a file name an export may have: a name alone, never a path, with an export's ending.
fn export_name(name: &str) -> bool {
    let ending = name
        .rsplit_once('.')
        .map(|(stem, end)| !stem.is_empty() && ENDINGS.contains(&end));
    name.len() <= 240
        && ending == Some(true)
        && !name.starts_with('.')
        && !name.ends_with(' ')
        && !name.contains("..")
        && !name
            .chars()
            .any(|c| c.is_control() || "/\\:*?\"<>|".contains(c))
}

/// `name` with `n` before its ending: `plan.svg` is `plan-2.svg`.
fn numbered(name: &str, n: usize) -> String {
    match (n, name.rsplit_once('.')) {
        (1, _) | (_, None) => name.to_string(),
        (_, Some((stem, end))) => format!("{stem}-{n}.{end}"),
    }
}

/// Writes an export's files as new files in `folder`, made where missing: never over a file already there.
/// A name taken gives the next number, the same for every file. All of the files or none. Gives the names written.
pub fn write_new(
    root: &Path,
    folder: &str,
    files: &[(String, Vec<u8>)],
) -> Result<Vec<String>, String> {
    if files.is_empty() {
        return Err("an export needs a file".to_string());
    }
    if let Some((bad, _)) = files.iter().find(|(name, _)| !export_name(name)) {
        return Err(format!("not a name an export may have: {bad:?}"));
    }
    make_dir(root, folder)?;
    let dir = inside(root, folder)?;
    for n in 1..=1000 {
        let names: Vec<String> = files.iter().map(|(name, _)| numbered(name, n)).collect();
        if names
            .iter()
            .any(|name| dir.join(name).symlink_metadata().is_ok())
        {
            continue;
        }
        let mut made: Vec<PathBuf> = Vec::new();
        let written = files.iter().zip(&names).try_for_each(|((_, bytes), name)| {
            let path = dir.join(name);
            let mut out = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)?;
            made.push(path);
            out.write_all(bytes)?;
            out.sync_all()
        });
        match written {
            Ok(()) => return Ok(names),
            Err(e) => {
                for path in made {
                    let _ = fs::remove_file(path);
                }
                if e.kind() != ErrorKind::AlreadyExists {
                    return Err(said(e));
                }
            }
        }
    }
    Err("every name for this export is taken".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "thoughtknot-place-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir.canonicalize().unwrap()
    }

    #[test]
    fn a_path_by_its_words_stays_inside() {
        let root = folder();
        for bad in [
            "../x.md",
            "a/../../x.md",
            "/etc/passwd",
            ".git/config",
            "a/.obsidian/x.md",
            "a\\b.md",
            "a\0.md",
        ] {
            assert!(inside(&root, bad).is_err(), "{bad} was let through");
        }
        assert_eq!(
            inside(&root, "a/b.md").unwrap(),
            root.join("a").join("b.md")
        );
        assert_eq!(inside(&root, "").unwrap(), root);
    }

    #[cfg(unix)]
    #[test]
    fn a_link_out_of_the_folder_is_refused() {
        let root = folder();
        let outside = folder().with_extension("outside");
        fs::create_dir_all(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, root.join("out")).unwrap();
        assert!(inside(&root, "out/x.md").is_err());
        assert!(write_text(&root, "out/x.md", "no").is_err());
        assert!(!outside.join("x.md").exists());
    }

    #[cfg(unix)]
    #[test]
    fn a_note_keeps_its_file_mode_when_saved() {
        use std::os::unix::fs::PermissionsExt;
        let root = folder();
        write_text(&root, "n.md", "one").unwrap();
        fs::set_permissions(root.join("n.md"), fs::Permissions::from_mode(0o600)).unwrap();
        write_text(&root, "n.md", "two").unwrap();
        let mode = fs::metadata(root.join("n.md"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
        assert_eq!(read_text(&root, "n.md").unwrap(), "two");
    }

    #[cfg(unix)]
    #[test]
    fn a_link_planted_at_the_temp_name_is_never_written_through() {
        let root = folder();
        let outside = folder().with_extension("outside-file");
        fs::write(&outside, "kept").unwrap();
        std::os::unix::fs::symlink(&outside, root.join(".n.md.thoughtknot-fixed")).unwrap();
        assert!(write_text_with(&root, "n.md", "no", "fixed").is_err());
        assert_eq!(fs::read_to_string(&outside).unwrap(), "kept");
        assert!(!root.join("n.md").exists());
        write_text(&root, "n.md", "yes").unwrap();
        assert_eq!(read_text(&root, "n.md").unwrap(), "yes");
    }

    #[test]
    fn a_note_is_written_whole_and_read_back_byte_for_byte() {
        let root = folder();
        make_dir(&root, "a/b").unwrap();
        let text = "\u{feff}line\r\nünïcödé 漢字 😀  \n";
        write_text(&root, "a/b/n.md", text).unwrap();
        assert_eq!(read_text(&root, "a/b/n.md").unwrap(), text);
        assert_eq!(
            read_dir(&root, "a/b").unwrap(),
            vec![("n.md".to_string(), false)]
        );
        remove_file(&root, "a/b/n.md").unwrap();
        assert_eq!(read_text(&root, "a/b/n.md").unwrap_err(), "ENOENT");
    }

    #[test]
    fn an_export_is_written_as_new_files_and_never_over_one() {
        let root = folder();
        let files = vec![
            ("plan.svg".to_string(), b"<svg/>".to_vec()),
            ("plan.png".to_string(), vec![0x89, 0x50]),
        ];
        assert_eq!(
            write_new(&root, "Exports", &files).unwrap(),
            ["plan.svg", "plan.png"]
        );
        assert_eq!(
            write_new(&root, "Exports", &files).unwrap(),
            ["plan-2.svg", "plan-2.png"]
        );
        fs::write(root.join("Exports").join("plan-3.png"), "kept").unwrap();
        assert_eq!(
            write_new(&root, "Exports", &files).unwrap(),
            ["plan-4.svg", "plan-4.png"]
        );
        assert_eq!(read_text(&root, "Exports/plan-3.png").unwrap(), "kept");
        assert!(!root.join("Exports").join("plan-3.svg").exists());
        for bad in [
            "a/b.svg", "../b.svg", ".b.svg", "b.exe", "b", "b.svg ", "a\\b.svg",
        ] {
            assert!(
                write_new(&root, "", &[(bad.to_string(), vec![])]).is_err(),
                "{bad} was let through"
            );
        }
        assert!(write_new(&root, "../out", &files).is_err());
    }

    #[test]
    fn a_kept_picture_is_read_back_only_as_a_plain_picture_file() {
        let root = folder();
        let png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2];
        let files = vec![("plan.png".to_string(), png.to_vec())];
        assert_eq!(
            write_new(&root, "attachments", &files).unwrap(),
            ["plan.png"]
        );
        assert_eq!(read_picture(&root, "attachments/plan.png").unwrap(), png);
        // a webp and a jpeg are kept with their own endings
        let webp = [b"RIFF".as_slice(), &[0; 4], b"WEBP"].concat();
        let kept = [
            ("a.webp".to_string(), webp.clone()),
            ("b.jpg".to_string(), vec![0xff, 0xd8, 0xff]),
        ];
        assert_eq!(
            write_new(&root, "attachments", &kept).unwrap(),
            ["a.webp", "b.jpg"]
        );
        assert_eq!(read_picture(&root, "attachments/a.webp").unwrap(), webp);
        // text under a picture's name, SVG, a bad name, a missing file and a path out of the folder are refused
        fs::write(root.join("attachments").join("fake.png"), "<svg/>").unwrap();
        for bad in [
            "attachments/fake.png",
            "attachments/plan.svg",
            "attachments/gone.png",
            "../x.png",
            ".x/y.png",
            "attachments/.h.png",
        ] {
            assert!(read_picture(&root, bad).is_err(), "{bad} was let through");
        }
        assert_eq!(
            read_picture(&root, "attachments/gone.png").unwrap_err(),
            "ENOENT"
        );
    }

    #[test]
    fn a_picture_over_the_size_cap_is_not_read() {
        let root = folder();
        let mut big = vec![0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        big.resize(PICTURE_MOST_BYTES as usize + 1, 0);
        fs::write(root.join("big.png"), &big).unwrap();
        assert!(read_picture(&root, "big.png").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn a_picture_that_is_a_link_is_never_read() {
        let root = folder();
        let outside = folder().with_extension("pic");
        fs::write(&outside, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).unwrap();
        std::os::unix::fs::symlink(&outside, root.join("link.png")).unwrap();
        assert!(read_picture(&root, "link.png").is_err());
    }
}
