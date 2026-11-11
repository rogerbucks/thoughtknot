//! The desktop app's store of notes read in parts, in a SQLite file on the device (editor spec ES§53,
//! scale_parts_on_disk). A note too big to read at once is read in the window a part at a time, and its rows are kept
//! here, not in the window's memory. The window then asks for a page of rows at a time: a group's things, the links
//! near some things. So the window holds only what is on screen.
//!
//! It keeps the same contract as the memory store (packages/core/src/parts-store-contract.ts): the same answers to the
//! same reads, in the order the rows were put. The tests read the contract's cases from the core's fixture.
//!
//! The file is only a copy. The note's text stays the only store of the graph (text_is_the_store). So a file of an
//! older shape, or one SQLite cannot read, is thrown away and made again, and the note is read again.
//!
//! A note's version is written last. A note half put, or put again, answers as not held until its rows are all in.
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;

/// The JSON a read answers with.
pub use serde_json::Value as Answer;

/// The shape of the file. Raise it with any change to the tables: a file of another shape is thrown away.
pub const SHAPE: i64 = 1;

/// The most rows one write may carry, so no message from the window is too big to hold.
pub const ROWS_MOST: usize = 20_000;

/// The note lines, 1-based and inclusive, a thing or link was read from.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Span {
    pub line: i64,
    pub end: i64,
}

/// One thing as the store keeps it. The fields are in the order the core writes them.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ThingRow {
    pub note: String,
    pub graph: String,
    pub key: String,
    pub kind: String,
    pub text: String,
    pub group: String,
    /// Its properties, as canonical JSON text.
    pub props: String,
    pub span: Option<Span>,
}

/// One link as the store keeps it: its place among its graph's links, its ends and their groups.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LinkRow {
    pub note: String,
    pub graph: String,
    pub n: i64,
    pub from: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub reading: String,
    pub to: String,
    pub from_group: String,
    pub to_group: String,
    pub span: Option<Span>,
}

/// One group of a graph, with how many things it holds and how many links stay inside it.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GroupRow {
    pub note: String,
    pub graph: String,
    pub id: String,
    pub label: String,
    pub by: String,
    pub things: i64,
    pub links: i64,
}

/// The links between two groups, counted.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BetweenRow {
    pub note: String,
    pub graph: String,
    pub from: String,
    pub to: String,
    pub links: i64,
}

/// What the overview holds of a thing: no properties and no lines.
#[derive(Serialize, Debug)]
pub struct Brief {
    pub graph: String,
    pub key: String,
    pub kind: String,
    pub text: String,
    pub group: String,
}

/// One read, as the core's contract names it (StoreAsk).
#[derive(Deserialize, Debug)]
#[serde(tag = "ask", rename_all = "camelCase")]
pub enum Ask {
    Version {
        note: String,
    },
    Groups {
        note: String,
    },
    Briefs {
        note: String,
    },
    Links {
        note: String,
    },
    Things {
        note: String,
        groups: Vec<String>,
    },
    Inside {
        note: String,
        group: String,
    },
    Touching {
        note: String,
        keys: Vec<String>,
    },
    Span {
        note: String,
        graph: String,
        key: String,
    },
}

/// One step of putting a note's rows: start, its things and links a page at a time, its groups, then its version.
#[derive(Deserialize, Debug)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum Write {
    /// Takes out the note's rows and its version, so it answers as not held until done.
    Start { note: String },
    /// Things, the first at place `at`.
    Things {
        note: String,
        at: i64,
        rows: Vec<ThingRow>,
    },
    /// Links, the first at place `at`.
    Links {
        note: String,
        at: i64,
        rows: Vec<LinkRow>,
    },
    Groups {
        note: String,
        groups: Vec<GroupRow>,
        between: Vec<BetweenRow>,
    },
    /// The hash of the text the rows were read from, written last.
    Done { note: String, version: String },
    /// Takes the note out.
    Drop { note: String },
}

const TABLES: &str = "
CREATE TABLE notes (note TEXT PRIMARY KEY, version TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE things (note TEXT NOT NULL, place INTEGER NOT NULL, graph TEXT NOT NULL, key TEXT NOT NULL,
  kind TEXT NOT NULL, text TEXT NOT NULL, grp TEXT NOT NULL, props TEXT NOT NULL, line INTEGER, end_line INTEGER,
  PRIMARY KEY (note, place)) WITHOUT ROWID;
CREATE TABLE links (note TEXT NOT NULL, place INTEGER NOT NULL, graph TEXT NOT NULL, n INTEGER NOT NULL,
  src TEXT NOT NULL, type TEXT NOT NULL, reading TEXT NOT NULL, dst TEXT NOT NULL, src_grp TEXT NOT NULL,
  dst_grp TEXT NOT NULL, line INTEGER, end_line INTEGER, PRIMARY KEY (note, place)) WITHOUT ROWID;
CREATE TABLE thing_groups (note TEXT NOT NULL, place INTEGER NOT NULL, graph TEXT NOT NULL, id TEXT NOT NULL,
  label TEXT NOT NULL, by TEXT NOT NULL, things INTEGER NOT NULL, links INTEGER NOT NULL,
  PRIMARY KEY (note, place)) WITHOUT ROWID;
CREATE TABLE group_links (note TEXT NOT NULL, place INTEGER NOT NULL, graph TEXT NOT NULL, src TEXT NOT NULL,
  dst TEXT NOT NULL, links INTEGER NOT NULL, PRIMARY KEY (note, place)) WITHOUT ROWID;
CREATE INDEX things_by_group ON things (note, grp, place);
CREATE INDEX things_by_key ON things (note, graph, key, place);
CREATE INDEX links_by_src ON links (note, src);
CREATE INDEX links_by_dst ON links (note, dst);
CREATE INDEX links_by_group ON links (note, src_grp, dst_grp, place);
";

/// The tables a note's rows are in.
const NOTE_TABLES: [&str; 5] = ["notes", "things", "links", "thing_groups", "group_links"];

const THING: &str = "SELECT note, graph, key, kind, text, grp, props, line, end_line FROM things";
const LINK: &str =
    "SELECT note, graph, n, src, type, reading, dst, src_grp, dst_grp, line, end_line FROM links";

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn span(row: &Row, at: usize) -> rusqlite::Result<Option<Span>> {
    let line: Option<i64> = row.get(at)?;
    let end: Option<i64> = row.get(at + 1)?;
    Ok(line.map(|line| Span {
        line,
        end: end.unwrap_or(line),
    }))
}

fn thing(row: &Row) -> rusqlite::Result<ThingRow> {
    Ok(ThingRow {
        note: row.get(0)?,
        graph: row.get(1)?,
        key: row.get(2)?,
        kind: row.get(3)?,
        text: row.get(4)?,
        group: row.get(5)?,
        props: row.get(6)?,
        span: span(row, 7)?,
    })
}

fn link(row: &Row) -> rusqlite::Result<LinkRow> {
    Ok(LinkRow {
        note: row.get(0)?,
        graph: row.get(1)?,
        n: row.get(2)?,
        from: row.get(3)?,
        kind: row.get(4)?,
        reading: row.get(5)?,
        to: row.get(6)?,
        from_group: row.get(7)?,
        to_group: row.get(8)?,
        span: span(row, 9)?,
    })
}

/// The store, over one SQLite file or one kept in memory for a test.
pub struct Store {
    conn: Connection,
}

impl Store {
    /// The store in the file at `path`, made when there is none. A file of another shape, or one that cannot be read,
    /// is thrown away and made again: it held only a copy.
    pub fn open(path: &Path) -> Result<Store, String> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(err)?;
        }
        if let Ok(store) = Store::over(Connection::open(path).map_err(err)?) {
            return Ok(store);
        }
        for end in ["", "-journal", "-wal", "-shm"] {
            let mut name = path.as_os_str().to_owned();
            name.push(end);
            let _ = std::fs::remove_file(&name);
        }
        Store::over(Connection::open(path).map_err(err)?)
    }

    /// A store in memory, gone when it is dropped.
    pub fn in_memory() -> Result<Store, String> {
        Store::over(Connection::open_in_memory().map_err(err)?)
    }

    /// The store over `conn`: its tables made if it is new, refused if it is of another shape or cannot be read.
    fn over(conn: Connection) -> Result<Store, String> {
        conn.pragma_update(None, "synchronous", "NORMAL")
            .map_err(err)?;
        let shape: i64 = conn
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .map_err(err)?;
        let tables: i64 = conn
            .query_row("SELECT count(*) FROM sqlite_schema", [], |r| r.get(0))
            .map_err(err)?;
        if tables == 0 {
            conn.execute_batch(TABLES).map_err(err)?;
            conn.pragma_update(None, "user_version", SHAPE)
                .map_err(err)?;
        } else if shape != SHAPE {
            return Err(format!("a store of shape {shape}, not {SHAPE}"));
        }
        // every table is read once, so a broken file is found now, not in the middle of a drawing
        for t in NOTE_TABLES {
            conn.query_row(&format!("SELECT count(*) FROM {t}"), [], |r| {
                r.get::<_, i64>(0)
            })
            .map_err(err)?;
        }
        Ok(Store { conn })
    }

    /// One step of putting a note's rows. A step that fails leaves none of its rows.
    pub fn write(&mut self, w: Write) -> Result<(), String> {
        let tx = self.conn.transaction().map_err(err)?;
        match w {
            Write::Start { note } | Write::Drop { note } => {
                for t in NOTE_TABLES {
                    tx.execute(&format!("DELETE FROM {t} WHERE note = ?1"), [&note])
                        .map_err(err)?;
                }
            }
            Write::Things { note, at, rows } => {
                fits(&note, rows.len(), rows.iter().map(|r| &r.note))?;
                let mut put = tx
                    .prepare("INSERT INTO things VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)")
                    .map_err(err)?;
                for (i, t) in rows.iter().enumerate() {
                    let (line, end) = lines(&t.span);
                    put.execute(params![
                        note,
                        at + i as i64,
                        t.graph,
                        t.key,
                        t.kind,
                        t.text,
                        t.group,
                        t.props,
                        line,
                        end
                    ])
                    .map_err(err)?;
                }
            }
            Write::Links { note, at, rows } => {
                fits(&note, rows.len(), rows.iter().map(|r| &r.note))?;
                let mut put = tx
                    .prepare(
                        "INSERT INTO links VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                    )
                    .map_err(err)?;
                for (i, l) in rows.iter().enumerate() {
                    let (line, end) = lines(&l.span);
                    put.execute(params![
                        note,
                        at + i as i64,
                        l.graph,
                        l.n,
                        l.from,
                        l.kind,
                        l.reading,
                        l.to,
                        l.from_group,
                        l.to_group,
                        line,
                        end
                    ])
                    .map_err(err)?;
                }
            }
            Write::Groups {
                note,
                groups,
                between,
            } => {
                fits(&note, groups.len(), groups.iter().map(|r| &r.note))?;
                fits(&note, between.len(), between.iter().map(|r| &r.note))?;
                tx.execute("DELETE FROM thing_groups WHERE note = ?1", [&note])
                    .map_err(err)?;
                tx.execute("DELETE FROM group_links WHERE note = ?1", [&note])
                    .map_err(err)?;
                for (i, g) in groups.iter().enumerate() {
                    tx.execute(
                        "INSERT INTO thing_groups VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                        params![note, i as i64, g.graph, g.id, g.label, g.by, g.things, g.links],
                    )
                    .map_err(err)?;
                }
                for (i, b) in between.iter().enumerate() {
                    tx.execute(
                        "INSERT INTO group_links VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        params![note, i as i64, b.graph, b.from, b.to, b.links],
                    )
                    .map_err(err)?;
                }
            }
            Write::Done { note, version } => {
                tx.execute(
                    "INSERT OR REPLACE INTO notes VALUES (?1, ?2)",
                    params![note, version],
                )
                .map_err(err)?;
            }
        }
        tx.commit().map_err(err)
    }

    /// The answer to one read, as JSON, as the memory store gives it.
    pub fn read(&self, ask: &Ask) -> Result<Value, String> {
        let c = &self.conn;
        match ask {
            Ask::Version { note } => {
                let v: Option<String> = c
                    .query_row("SELECT version FROM notes WHERE note = ?1", [note], |r| {
                        r.get(0)
                    })
                    .optional()
                    .map_err(err)?;
                Ok(v.map(Value::String).unwrap_or(Value::Null))
            }
            Ask::Groups { note } => {
                let groups = rows(
                    c,
                    "SELECT note, graph, id, label, by, things, links FROM thing_groups WHERE note = ?1 ORDER BY place",
                    params![note],
                    |r| {
                        Ok(GroupRow {
                            note: r.get(0)?,
                            graph: r.get(1)?,
                            id: r.get(2)?,
                            label: r.get(3)?,
                            by: r.get(4)?,
                            things: r.get(5)?,
                            links: r.get(6)?,
                        })
                    },
                )?;
                let between = rows(
                    c,
                    "SELECT note, graph, src, dst, links FROM group_links WHERE note = ?1 ORDER BY place",
                    params![note],
                    |r| {
                        Ok(BetweenRow {
                            note: r.get(0)?,
                            graph: r.get(1)?,
                            from: r.get(2)?,
                            to: r.get(3)?,
                            links: r.get(4)?,
                        })
                    },
                )?;
                Ok(serde_json::json!({ "groups": groups, "between": between }))
            }
            Ask::Briefs { note } => json(&rows(
                c,
                "SELECT graph, key, kind, text, grp FROM things WHERE note = ?1 ORDER BY place",
                params![note],
                |r| {
                    Ok(Brief {
                        graph: r.get(0)?,
                        key: r.get(1)?,
                        kind: r.get(2)?,
                        text: r.get(3)?,
                        group: r.get(4)?,
                    })
                },
            )?),
            Ask::Links { note } => json(&rows(
                c,
                &format!("{LINK} WHERE note = ?1 ORDER BY place"),
                params![note],
                link,
            )?),
            Ask::Things { note, groups } => {
                let sql = format!(
                    "{THING} WHERE note = ?1 AND grp IN (SELECT value FROM json_each(?2)) ORDER BY place"
                );
                json(&rows(c, &sql, params![note, list(groups)?], thing)?)
            }
            Ask::Inside { note, group } => json(&rows(
                c,
                &format!("{LINK} WHERE note = ?1 AND src_grp = ?2 AND dst_grp = ?2 ORDER BY place"),
                params![note, group],
                link,
            )?),
            Ask::Touching { note, keys } => {
                let sql = format!(
                    "{LINK} WHERE note = ?1 AND (src IN (SELECT value FROM json_each(?2)) \
                     OR dst IN (SELECT value FROM json_each(?2))) ORDER BY place"
                );
                json(&rows(c, &sql, params![note, list(keys)?], link)?)
            }
            Ask::Span { note, graph, key } => {
                // as the memory store finds it: the first thing of that key among the graph's groups
                let found = c
                    .query_row(
                        "SELECT line, end_line FROM things WHERE note = ?1 AND graph = ?2 AND key = ?3 AND grp IN \
                         (SELECT id FROM thing_groups WHERE note = ?1 AND graph = ?2) ORDER BY place LIMIT 1",
                        params![note, graph, key],
                        |r| span(r, 0),
                    )
                    .optional()
                    .map_err(err)?;
                Ok(serde_json::to_value(found.flatten()).map_err(err)?)
            }
        }
    }
}

/// Rows as the JSON the window reads.
fn json<T: Serialize>(v: &T) -> Result<Value, String> {
    serde_json::to_value(v).map_err(err)
}

/// The rows a query gives, each made by `make`.
fn rows<T>(
    c: &Connection,
    sql: &str,
    args: impl rusqlite::Params,
    make: impl FnMut(&Row) -> rusqlite::Result<T>,
) -> Result<Vec<T>, String> {
    let mut q = c.prepare_cached(sql).map_err(err)?;
    let found = q.query_map(args, make).map_err(err)?;
    found.collect::<rusqlite::Result<Vec<T>>>().map_err(err)
}

/// Names given as one JSON list, which the query reads with `json_each`: so any number of them is one query.
fn list(names: &[String]) -> Result<String, String> {
    serde_json::to_string(names).map_err(err)
}

/// A span as its two columns.
fn lines(span: &Option<Span>) -> (Option<i64>, Option<i64>) {
    (span.as_ref().map(|s| s.line), span.as_ref().map(|s| s.end))
}

/// Refuses a write of more rows than one may carry, or of a row of another note.
fn fits<'a>(
    note: &str,
    count: usize,
    notes: impl Iterator<Item = &'a String>,
) -> Result<(), String> {
    if count > ROWS_MOST {
        return Err(format!("{count} rows in one write, past {ROWS_MOST}"));
    }
    let mut notes = notes;
    if notes.any(|n| n != note) {
        return Err(format!("a row of another note than {note}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests;
