// The note CRDT in Rust (design: docs in /design/rust-sync-engine.md). The app keeps its notes as Automerge texts
// without WebAssembly, which its window does not allow. It must write the very same bytes as the JavaScript build in
// packages/sync/src/crdt.ts, so devices of either kind read each other's records. `test/fixtures/crdt.json` in the
// sync package holds the JavaScript bytes, and the tests below check this build against them.
use std::collections::HashMap;
use std::sync::Mutex;

use automerge::transaction::{CommitOptions, Transactable};
use automerge::{ActorId, AutoCommit, Change, ChangeHash, Cursor, ObjId, ObjType, ReadDoc, ROOT};

/// The actor of a note's first change: the same on every device, so the first change has the same bytes everywhere.
const GENESIS_ACTOR: [u8; 16] = [0; 16];

/// The note's first change for `text`, as bytes.
pub fn genesis(text: &str) -> Result<Vec<u8>, String> {
    let mut doc = AutoCommit::new().with_actor(ActorId::from(GENESIS_ACTOR.to_vec()));
    let note = doc
        .put_object(ROOT, "text", ObjType::Text)
        .map_err(|e| e.to_string())?;
    doc.splice_text(&note, 0, 0, text)
        .map_err(|e| e.to_string())?;
    doc.commit_with(CommitOptions::default().with_message("").with_time(0));
    let change = doc.get_last_local_change().ok_or("no change was made")?;
    Ok(change.raw_bytes().to_vec())
}

/// One note: an Automerge text that a device edits under its own actor.
pub struct Note {
    doc: AutoCommit,
    text: ObjId,
    /// The state this device last merged everything into: the base of its next merge.
    merged: Vec<ChangeHash>,
}

/// What a merge brought: the text both last shared, this device's text before, the other devices' text, and the result.
#[derive(Debug, PartialEq)]
pub struct Merge {
    pub base: String,
    pub ours: String,
    pub theirs: String,
    pub merged: String,
}

fn changes_of(records: &[Vec<u8>]) -> Result<Vec<Change>, String> {
    records
        .iter()
        .map(|r| Change::from_bytes(r.clone()).map_err(|e| e.to_string()))
        .collect()
}

impl Note {
    /// The note from every record so far, edited by `actor` (16 bytes, the same for the same device).
    pub fn open(actor: &[u8], records: &[Vec<u8>]) -> Result<Note, String> {
        let mut doc = AutoCommit::new().with_actor(ActorId::from(actor.to_vec()));
        doc.apply_changes(changes_of(records)?)
            .map_err(|e| e.to_string())?;
        let text = doc
            .get(ROOT, "text")
            .map_err(|e| e.to_string())?
            .map(|(_, id)| id)
            .ok_or("the note has no text")?;
        let merged = doc.get_heads();
        Ok(Note { doc, text, merged })
    }

    pub fn text(&self) -> Result<String, String> {
        self.doc.text(&self.text).map_err(|e| e.to_string())
    }

    /// Replaces `from` to `to` by `insert`, and gives the change made, as the bytes to keep.
    pub fn splice(
        &mut self,
        from: usize,
        to: usize,
        insert: &str,
        message: &str,
        time: i64,
    ) -> Result<Vec<u8>, String> {
        self.doc
            .splice_text(&self.text, from, (to - from) as isize, insert)
            .map_err(|e| e.to_string())?;
        self.doc.commit_with(
            CommitOptions::default()
                .with_message(message)
                .with_time(time),
        );
        let change = self
            .doc
            .get_last_local_change()
            .ok_or("no change was made")?;
        Ok(change.raw_bytes().to_vec())
    }

    /// Merges in the records this device lacks. Nothing, when none of them is new.
    pub fn merge(&mut self, records: &[Vec<u8>]) -> Result<Option<Merge>, String> {
        let had = self.doc.get_heads();
        let ours = self.text()?;
        self.doc
            .apply_changes(changes_of(records)?)
            .map_err(|e| e.to_string())?;
        let now = self.doc.get_heads();
        if now == had {
            return Ok(None);
        }
        let theirs: Vec<ChangeHash> = now.iter().filter(|h| !had.contains(h)).copied().collect();
        let at = |heads: &[ChangeHash]| {
            self.doc
                .text_at(&self.text, heads)
                .map_err(|e| e.to_string())
        };
        let out = Merge {
            base: at(&self.merged)?,
            ours,
            theirs: at(&theirs)?,
            merged: self.text()?,
        };
        self.merged = now;
        Ok(Some(out))
    }

    /// Whether the note's text was ever `text`: a file with that text is only behind, and holds no edit of its own.
    pub fn has_been(&mut self, text: &str) -> Result<bool, String> {
        let mut heads: Vec<ChangeHash> = Vec::new();
        for change in self.doc.get_changes(&[]) {
            heads.retain(|h| !change.deps().contains(h));
            heads.push(change.hash());
            if self
                .doc
                .text_at(&self.text, &heads)
                .map_err(|e| e.to_string())?
                == text
            {
                return Ok(true);
            }
        }
        Ok(false)
    }

    /// An anchor at `place` that stays on its character, written as text.
    pub fn anchor(&self, place: usize) -> Result<String, String> {
        let cursor = self
            .doc
            .get_cursor(&self.text, place, None)
            .map_err(|e| e.to_string())?;
        Ok(cursor.to_string())
    }

    /// Where an anchor is now.
    pub fn place(&self, anchor: &str) -> Result<usize, String> {
        let cursor = Cursor::try_from(anchor).map_err(|e| e.to_string())?;
        self.doc
            .get_cursor_position(&self.text, &cursor, None)
            .map_err(|e| e.to_string())
    }
}

fn unhex(s: &str) -> Result<Vec<u8>, String> {
    if s.len() % 2 != 0 || !s.is_ascii() {
        return Err("the bytes are not written as hexadecimal".into());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&s[i..i + 2], 16)
                .map_err(|_| "the bytes are not written as hexadecimal".to_string())
        })
        .collect()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// What opening a note gave: its text, and the first change when the note was new (to keep in the store).
#[derive(Debug, PartialEq, serde::Serialize)]
pub struct Opened {
    pub text: String,
    pub first: Option<String>,
}

/// What a merge brought, with the texts as the window reads them.
#[derive(Debug, PartialEq, serde::Serialize)]
pub struct Joined {
    pub base: String,
    pub ours: String,
    pub theirs: String,
    pub merged: String,
}

/// The notes open on this device. Bytes go in and out as hexadecimal, so they pass through the window as plain text.
#[derive(Default)]
pub struct Notes(Mutex<HashMap<String, Note>>);

impl Notes {
    fn with<T>(
        &self,
        note: &str,
        f: impl FnOnce(&mut Note) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut open = self
            .0
            .lock()
            .map_err(|_| "the notes are unreadable".to_string())?;
        f(open.get_mut(note).ok_or("the note is not open")?)
    }

    /// Opens `note` from its records. With none, the note starts as `text` and its first change is given back.
    pub fn open(
        &self,
        note: &str,
        actor: &str,
        records: &[String],
        text: &str,
    ) -> Result<Opened, String> {
        let mut open = self
            .0
            .lock()
            .map_err(|_| "the notes are unreadable".to_string())?;
        if let Some(have) = open.get(note) {
            return Ok(Opened {
                text: have.text()?,
                first: None,
            });
        }
        let mut bytes = records
            .iter()
            .map(|r| unhex(r))
            .collect::<Result<Vec<_>, _>>()?;
        let first = bytes.is_empty().then(|| genesis(text)).transpose()?;
        if let Some(g) = &first {
            bytes.push(g.clone());
        }
        let opened = Note::open(&unhex(actor)?, &bytes)?;
        let out = Opened {
            text: opened.text()?,
            first: first.map(|g| hex(&g)),
        };
        open.insert(note.to_string(), opened);
        Ok(out)
    }

    pub fn text(&self, note: &str) -> Result<String, String> {
        self.with(note, |n| n.text())
    }

    /// Replaces `from` to `to` by `insert`; the change made, to keep in the store.
    pub fn splice(
        &self,
        note: &str,
        from: usize,
        to: usize,
        insert: &str,
        message: &str,
        time: i64,
    ) -> Result<String, String> {
        self.with(note, |n| {
            n.splice(from, to, insert, message, time).map(|c| hex(&c))
        })
    }

    pub fn merge(&self, note: &str, records: &[String]) -> Result<Option<Joined>, String> {
        let bytes = records
            .iter()
            .map(|r| unhex(r))
            .collect::<Result<Vec<_>, _>>()?;
        self.with(note, |n| {
            Ok(n.merge(&bytes)?.map(|m| Joined {
                base: m.base,
                ours: m.ours,
                theirs: m.theirs,
                merged: m.merged,
            }))
        })
    }

    pub fn has_been(&self, note: &str, text: &str) -> Result<bool, String> {
        self.with(note, |n| n.has_been(text))
    }

    pub fn anchor(&self, note: &str, place: usize) -> Result<String, String> {
        self.with(note, |n| n.anchor(place))
    }

    pub fn place(&self, note: &str, anchor: &str) -> Result<usize, String> {
        self.with(note, |n| n.place(anchor))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn fixture() -> Value {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../sync/test/fixtures/crdt.json"
        );
        serde_json::from_str(&std::fs::read_to_string(path).expect("the fixture file"))
            .expect("valid json")
    }

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }

    #[test]
    fn the_first_change_has_the_bytes_the_javascript_build_makes() {
        let f = fixture();
        let text = f["first"]["text"].as_str().unwrap();
        assert_eq!(
            hex(&genesis(text).unwrap()),
            f["first"]["change"].as_str().unwrap()
        );
    }
    fn unhex(s: &str) -> Vec<u8> {
        (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
            .collect()
    }

    #[test]
    fn an_edit_has_the_bytes_the_javascript_build_makes_and_the_anchor_stays_on_its_character() {
        let f = fixture();
        let actor = unhex(f["edit"]["actor"].as_str().unwrap());
        let mut note =
            Note::open(&actor, &[unhex(f["first"]["change"].as_str().unwrap())]).unwrap();
        assert_eq!(note.text().unwrap(), "hello world");
        let e = &f["edit"];
        let made = note
            .splice(
                e["from"].as_u64().unwrap() as usize,
                e["to"].as_u64().unwrap() as usize,
                e["insert"].as_str().unwrap(),
                e["message"].as_str().unwrap(),
                e["time"].as_i64().unwrap(),
            )
            .unwrap();
        assert_eq!(hex(&made), e["change"].as_str().unwrap());
        assert_eq!(note.text().unwrap(), e["text"].as_str().unwrap());
        let c = &f["cursor"];
        assert_eq!(
            note.anchor(c["place"].as_u64().unwrap() as usize).unwrap(),
            c["cursor"].as_str().unwrap()
        );
        assert_eq!(note.place(c["cursor"].as_str().unwrap()).unwrap(), 8);
    }

    #[test]
    fn records_made_by_the_javascript_build_open_in_rust() {
        let f = fixture();
        let records = [
            unhex(f["first"]["change"].as_str().unwrap()),
            unhex(f["edit"]["change"].as_str().unwrap()),
        ];
        let note = Note::open(&[1; 16], &records).unwrap();
        assert_eq!(note.text().unwrap(), "hello there");
    }
    #[test]
    fn a_merge_and_the_texts_a_note_has_been_are_what_the_javascript_build_says() {
        let f = &fixture()["concurrent"];
        let rec = |k: &str| unhex(f[k].as_str().unwrap());
        let mut note = Note::open(&unhex(f["actor"].as_str().unwrap()), &[rec("first")]).unwrap();
        note.splice(
            6,
            11,
            "there",
            &serde_json::json!({"author": "roger", "device": "laptop"}).to_string(),
            0,
        )
        .unwrap();
        let merge = note.merge(&[rec("first"), rec("theirs")]).unwrap().unwrap();
        let want = &f["merged"];
        let s = |k: &str| want[k].as_str().unwrap().to_string();
        assert_eq!(
            merge,
            Merge {
                base: s("base"),
                ours: s("ours"),
                theirs: s("theirs"),
                merged: s("merged")
            }
        );
        assert!(
            note.merge(&[rec("first"), rec("theirs")])
                .unwrap()
                .is_none(),
            "nothing new, nothing merged"
        );
        for pair in f["hasBeen"].as_array().unwrap() {
            let text = pair[0].as_str().unwrap();
            assert_eq!(
                note.has_been(text).unwrap(),
                pair[1].as_bool().unwrap(),
                "{text}"
            );
        }
    }
    #[test]
    fn the_notes_open_edit_and_merge_through_text_alone() {
        let f = fixture();
        let c = &f["concurrent"];
        let (actor, first, theirs) = (
            c["actor"].as_str().unwrap(),
            c["first"].as_str().unwrap(),
            c["theirs"].as_str().unwrap(),
        );
        let notes = Notes::default();
        let new = notes.open("n", actor, &[], "hello world").unwrap();
        assert_eq!(
            new.first.as_deref(),
            Some(first),
            "a new note gives the first change to keep"
        );
        assert_eq!(new.text, "hello world");
        let again = notes.open("n", actor, &[], "other").unwrap();
        assert_eq!(
            (again.text.as_str(), again.first),
            ("hello world", None),
            "an open note is not started twice"
        );
        notes.splice("n", 6, 11, "there", "{}", 0).unwrap();
        let joined = notes
            .merge("n", &[first.to_string(), theirs.to_string()])
            .unwrap()
            .unwrap();
        assert_eq!(joined.merged, c["merged"]["merged"].as_str().unwrap());
        assert!(notes.has_been("n", "hello there").unwrap());
        let anchor = notes.anchor("n", 8).unwrap();
        assert_eq!(notes.place("n", &anchor).unwrap(), 8);
        assert_eq!(notes.text("n").unwrap(), "hello there!");
    }

    #[test]
    fn a_note_that_is_not_open_and_bytes_that_are_not_hexadecimal_are_refused() {
        let notes = Notes::default();
        assert!(notes.text("none").is_err());
        assert!(notes.open("n", "zz", &[], "x").is_err());
        assert!(notes.open("n", "00", &["abc".to_string()], "x").is_err());
    }
}
