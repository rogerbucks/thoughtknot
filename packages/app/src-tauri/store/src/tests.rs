//! The store keeps the core's contract: the cases in packages/core/test/fixtures/parts-store-contract.json, put a few
//! rows a write at a time, give the answers the memory store gave. A file outlasts the store, and one of another shape
//! or one that is broken is thrown away.
use super::*;
use std::path::PathBuf;

/// The contract's cases, as the core wrote them.
fn cases() -> Value {
    let text = include_str!("../../../../core/test/fixtures/parts-store-contract.json");
    serde_json::from_str(text).expect("the contract's cases")
}

/// Puts a note's rows as the window does, `page` rows a write.
fn put(store: &mut Store, rows: &Value, page: usize) {
    let note = rows["note"].as_str().unwrap().to_string();
    let w = |v: Value| serde_json::from_value::<Write>(v).unwrap();
    store
        .write(w(serde_json::json!({ "op": "start", "note": note })))
        .unwrap();
    for (op, list) in [("things", &rows["things"]), ("links", &rows["links"])] {
        let all = list.as_array().unwrap();
        for (i, chunk) in all.chunks(page).enumerate() {
            let at = (i * page) as i64;
            store
                .write(w(
                    serde_json::json!({ "op": op, "note": note, "at": at, "rows": chunk }),
                ))
                .unwrap();
        }
    }
    let groups = serde_json::json!({ "op": "groups", "note": note, "groups": rows["groups"], "between": rows["between"] });
    store.write(w(groups)).unwrap();
    store
        .write(w(
            serde_json::json!({ "op": "done", "note": note, "version": rows["version"] }),
        ))
        .unwrap();
}

/// A file of its own in the system's temporary folder, for one test.
fn file(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("thoughtknot-store-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    dir.join("parts.sqlite")
}

#[test]
fn every_read_answers_as_the_memory_store_does() {
    let cases = cases();
    let mut store = Store::in_memory().unwrap();
    for rows in cases["rows"].as_array().unwrap() {
        put(&mut store, rows, 7);
    }
    let asks = cases["asks"].as_array().unwrap();
    assert!(asks.len() > 40);
    for a in asks {
        let ask: Ask = serde_json::from_value(a.clone()).unwrap();
        let got = store.read(&ask).unwrap();
        assert_eq!(got, a["answer"], "{} of {}", a["ask"], a["note"]);
    }
}

#[test]
fn a_note_half_put_is_not_held_and_a_dropped_note_is_forgotten() {
    let cases = cases();
    let rows = &cases["rows"][1];
    let note = rows["note"].as_str().unwrap();
    let mut store = Store::in_memory().unwrap();
    put(&mut store, rows, 1000);
    let version = Ask::Version { note: note.into() };
    assert_eq!(store.read(&version).unwrap(), rows["version"]);
    store.write(Write::Start { note: note.into() }).unwrap();
    assert_eq!(
        store.read(&version).unwrap(),
        Value::Null,
        "put again: not held until done"
    );
    put(&mut store, rows, 1000);
    store.write(Write::Drop { note: note.into() }).unwrap();
    assert_eq!(store.read(&version).unwrap(), Value::Null);
    assert_eq!(
        store.read(&Ask::Briefs { note: note.into() }).unwrap(),
        serde_json::json!([])
    );
}

#[test]
fn a_write_too_big_or_of_another_note_is_refused_whole() {
    let mut store = Store::in_memory().unwrap();
    let row = |note: &str| ThingRow {
        note: note.into(),
        graph: "g".into(),
        key: "a".into(),
        kind: "T".into(),
        text: "A".into(),
        group: "g1".into(),
        props: "{}".into(),
        span: None,
    };
    let many = vec![row("n.md"); ROWS_MOST + 1];
    assert!(store
        .write(Write::Things {
            note: "n.md".into(),
            at: 0,
            rows: many
        })
        .is_err());
    let mixed = vec![row("n.md"), row("other.md")];
    assert!(store
        .write(Write::Things {
            note: "n.md".into(),
            at: 0,
            rows: mixed
        })
        .is_err());
    let things = Ask::Things {
        note: "n.md".into(),
        groups: vec!["g1".into()],
    };
    assert_eq!(
        store.read(&things).unwrap(),
        serde_json::json!([]),
        "nothing of either is kept"
    );
}

#[test]
fn the_file_outlasts_the_store() {
    let cases = cases();
    let rows = &cases["rows"][1];
    let path = file("lasts");
    put(&mut Store::open(&path).unwrap(), rows, 50);
    let again = Store::open(&path).unwrap();
    let version = Ask::Version {
        note: rows["note"].as_str().unwrap().into(),
    };
    assert_eq!(again.read(&version).unwrap(), rows["version"]);
}

#[test]
fn a_file_of_another_shape_or_broken_is_made_again() {
    let cases = cases();
    let rows = &cases["rows"][1];
    let version = Ask::Version {
        note: rows["note"].as_str().unwrap().into(),
    };
    // another shape: the rows it held are never read
    let path = file("shape");
    put(&mut Store::open(&path).unwrap(), rows, 50);
    Connection::open(&path)
        .unwrap()
        .pragma_update(None, "user_version", SHAPE + 1)
        .unwrap();
    let made = Store::open(&path).unwrap();
    assert_eq!(made.read(&version).unwrap(), Value::Null);
    // broken: not a SQLite file at all
    let path = file("broken");
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, b"this is not a database, only words").unwrap();
    let mut made = Store::open(&path).unwrap();
    assert_eq!(made.read(&version).unwrap(), Value::Null);
    put(&mut made, rows, 50);
    assert_eq!(made.read(&version).unwrap(), rows["version"]);
}
