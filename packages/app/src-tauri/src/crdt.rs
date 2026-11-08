// The note CRDT in Rust (design: docs in /design/rust-sync-engine.md). The app keeps its notes as Automerge texts
// without WebAssembly, which its window does not allow. It must write the very same bytes as the JavaScript build in
// packages/sync/src/crdt.ts, so devices of either kind read each other's records. `test/fixtures/crdt.json` in the
// sync package holds the JavaScript bytes, and the tests below check this build against them.
use automerge::transaction::{CommitOptions, Transactable};
use automerge::{ActorId, AutoCommit, Change, Cursor, ObjId, ObjType, ReadDoc, ROOT};

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
}

impl Note {
    /// The note from every record so far, edited by `actor` (16 bytes, the same for the same device).
    pub fn open(actor: &[u8], records: &[Vec<u8>]) -> Result<Note, String> {
        let mut doc = AutoCommit::new().with_actor(ActorId::from(actor.to_vec()));
        let changes = records
            .iter()
            .map(|r| Change::from_bytes(r.clone()).map_err(|e| e.to_string()))
            .collect::<Result<Vec<_>, _>>()?;
        doc.apply_changes(changes).map_err(|e| e.to_string())?;
        let text = doc
            .get(ROOT, "text")
            .map_err(|e| e.to_string())?
            .map(|(_, id)| id)
            .ok_or("the note has no text")?;
        Ok(Note { doc, text })
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
}
