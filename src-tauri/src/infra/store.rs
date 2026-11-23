//! Persistent state in SQLite, owned by the backend.
//!
//! The schema is versioned with `PRAGMA user_version`; each entry in
//! [`MIGRATIONS`] upgrades the database by one version inside a transaction.

use std::collections::HashMap;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OptionalExtension, params};

use crate::domain::inbox::{self, InboxOp, ItemKind, ItemState};
use crate::domain::{DomainError, FileState, ProjectChange, ProjectId};

/// Schema migrations, applied in order. Index `i` upgrades version `i` → `i + 1`.
const MIGRATIONS: &[&str] = &[
    // v1 (#5): registered projects.
    "CREATE TABLE projects (
        id         INTEGER PRIMARY KEY,
        name       TEXT    NOT NULL,
        path       TEXT    NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
    );",
    // v2 (#6): last known state of tracked files; whether a project's
    // initial (silent) baseline has been taken.
    "ALTER TABLE projects ADD COLUMN baselined INTEGER NOT NULL DEFAULT 0;
     CREATE TABLE files (
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        rel_path   TEXT    NOT NULL,
        size       INTEGER NOT NULL,
        mtime_ns   INTEGER NOT NULL,
        hash       INTEGER NOT NULL,
        PRIMARY KEY (project_id, rel_path)
     );",
    // v3 (#7): the Inbox — one item per changed file.
    "CREATE TABLE inbox_items (
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        rel_path   TEXT    NOT NULL,
        kind       TEXT    NOT NULL CHECK (kind IN ('created', 'updated')),
        changed_at INTEGER NOT NULL,
        read       INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (project_id, rel_path)
     );
     CREATE INDEX inbox_by_time ON inbox_items (changed_at DESC);
     CREATE INDEX inbox_by_unread ON inbox_items (read, project_id);",
    // v4 (#8): app settings as key/value strings.
    "CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
     );",
];

/// An Inbox item as listed for the UI.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InboxRow {
    pub project: ProjectId,
    pub project_name: String,
    pub rel_path: String,
    pub kind: ItemKind,
    pub changed_at_ms: i64,
    pub read: bool,
}

/// Unread counts: total and per project (projects with unread items only).
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct UnreadCounts {
    pub total: u64,
    pub by_project: Vec<(ProjectId, u64)>,
}

/// A change to the stored file states of one project.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FileOp {
    Upsert(String, FileState),
    Delete(String),
}

/// A project row as stored (the path is the canonical path at registration).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredProject {
    pub id: ProjectId,
    pub name: String,
    pub path: String,
}

pub struct Store {
    conn: Connection,
}

impl std::fmt::Debug for Store {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Store").finish_non_exhaustive()
    }
}

impl Store {
    pub fn open(path: &Path) -> Result<Self, DomainError> {
        Self::init(Connection::open(path).map_err(storage)?)
    }

    pub fn open_in_memory() -> Result<Self, DomainError> {
        Self::init(Connection::open_in_memory().map_err(storage)?)
    }

    fn init(conn: Connection) -> Result<Self, DomainError> {
        conn.pragma_update(None, "foreign_keys", true)
            .map_err(storage)?;
        // Returns the resulting mode as a row ("memory" for in-memory DBs).
        conn.query_row("PRAGMA journal_mode = WAL", [], |r| r.get::<_, String>(0))
            .map_err(storage)?;
        let mut store = Self { conn };
        store.migrate()?;
        Ok(store)
    }

    pub fn schema_version(&self) -> Result<usize, DomainError> {
        self.conn
            .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .map(|v| v as usize)
            .map_err(storage)
    }

    fn migrate(&mut self) -> Result<(), DomainError> {
        let current = self.schema_version()?;
        if current > MIGRATIONS.len() {
            return Err(DomainError::Storage(format!(
                "database schema v{current} is newer than this app (v{})",
                MIGRATIONS.len()
            )));
        }
        for (i, sql) in MIGRATIONS.iter().enumerate().skip(current) {
            let tx = self.conn.transaction().map_err(storage)?;
            tx.execute_batch(sql).map_err(storage)?;
            tx.pragma_update(None, "user_version", (i + 1) as i64)
                .map_err(storage)?;
            tx.commit().map_err(storage)?;
        }
        Ok(())
    }

    pub fn list_projects(&self) -> Result<Vec<StoredProject>, DomainError> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, path FROM projects ORDER BY id")
            .map_err(storage)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(StoredProject {
                    id: ProjectId(r.get(0)?),
                    name: r.get(1)?,
                    path: r.get(2)?,
                })
            })
            .map_err(storage)?;
        rows.collect::<Result<_, _>>().map_err(storage)
    }

    pub fn insert_project(&self, name: &str, path: &str) -> Result<ProjectId, DomainError> {
        let exists = self
            .conn
            .query_row("SELECT 1 FROM projects WHERE path = ?1", [path], |_| Ok(()))
            .optional()
            .map_err(storage)?;
        if exists.is_some() {
            return Err(DomainError::AlreadyRegistered);
        }
        self.conn
            .execute(
                "INSERT INTO projects (name, path, created_at) VALUES (?1, ?2, ?3)",
                params![name, path, now_millis()],
            )
            .map_err(storage)?;
        Ok(ProjectId(self.conn.last_insert_rowid()))
    }

    /// Returns false if no such project existed.
    pub fn delete_project(&self, id: ProjectId) -> Result<bool, DomainError> {
        let n = self
            .conn
            .execute("DELETE FROM projects WHERE id = ?1", [id.0])
            .map_err(storage)?;
        Ok(n > 0)
    }
}

impl Store {
    /// All known file states of a project, keyed by wire `rel_path`.
    pub fn file_states(
        &self,
        project: ProjectId,
    ) -> Result<HashMap<String, FileState>, DomainError> {
        let mut stmt = self
            .conn
            .prepare("SELECT rel_path, size, mtime_ns, hash FROM files WHERE project_id = ?1")
            .map_err(storage)?;
        let rows = stmt
            .query_map([project.0], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    FileState {
                        size: r.get::<_, i64>(1)? as u64,
                        mtime_ns: r.get(2)?,
                        // u64 hashes are stored as their i64 bit pattern.
                        hash: r.get::<_, i64>(3)? as u64,
                    },
                ))
            })
            .map_err(storage)?;
        rows.collect::<Result<_, _>>().map_err(storage)
    }

    /// Applies `ops` atomically.
    pub fn apply_file_ops(
        &mut self,
        project: ProjectId,
        ops: &[FileOp],
    ) -> Result<(), DomainError> {
        let tx = self.conn.transaction().map_err(storage)?;
        {
            let mut upsert = tx
                .prepare_cached(
                    "INSERT INTO files (project_id, rel_path, size, mtime_ns, hash)
                     VALUES (?1, ?2, ?3, ?4, ?5)
                     ON CONFLICT (project_id, rel_path) DO UPDATE SET
                       size = excluded.size, mtime_ns = excluded.mtime_ns, hash = excluded.hash",
                )
                .map_err(storage)?;
            let mut delete = tx
                .prepare_cached("DELETE FROM files WHERE project_id = ?1 AND rel_path = ?2")
                .map_err(storage)?;
            for op in ops {
                match op {
                    FileOp::Upsert(rel, st) => upsert.execute(params![
                        project.0,
                        rel,
                        st.size as i64,
                        st.mtime_ns,
                        st.hash as i64
                    ]),
                    FileOp::Delete(rel) => delete.execute(params![project.0, rel]),
                }
                .map_err(storage)?;
            }
        }
        tx.commit().map_err(storage)
    }

    pub fn is_baselined(&self, project: ProjectId) -> Result<bool, DomainError> {
        self.conn
            .query_row(
                "SELECT baselined FROM projects WHERE id = ?1",
                [project.0],
                |r| r.get::<_, i64>(0),
            )
            .optional()
            .map(|v| v.unwrap_or(0) != 0)
            .map_err(storage)
    }

    pub fn mark_baselined(&self, project: ProjectId) -> Result<(), DomainError> {
        self.conn
            .execute(
                "UPDATE projects SET baselined = 1 WHERE id = ?1",
                [project.0],
            )
            .map(|_| ())
            .map_err(storage)
    }
}

impl Store {
    /// Applies a batch of detected changes to the Inbox in one transaction.
    pub fn record_changes(
        &mut self,
        changes: &[ProjectChange],
        now_ms: i64,
    ) -> Result<(), DomainError> {
        let tx = self.conn.transaction().map_err(storage)?;
        {
            let mut get = tx
                .prepare_cached(
                    "SELECT kind, changed_at, read FROM inbox_items
                     WHERE project_id = ?1 AND rel_path = ?2",
                )
                .map_err(storage)?;
            let mut upsert = tx
                .prepare_cached(
                    "INSERT INTO inbox_items (project_id, rel_path, kind, changed_at, read)
                     VALUES (?1, ?2, ?3, ?4, ?5)
                     ON CONFLICT (project_id, rel_path) DO UPDATE SET
                       kind = excluded.kind, changed_at = excluded.changed_at, read = excluded.read",
                )
                .map_err(storage)?;
            let mut remove = tx
                .prepare_cached("DELETE FROM inbox_items WHERE project_id = ?1 AND rel_path = ?2")
                .map_err(storage)?;
            for c in changes {
                let rel = c.rel.to_wire();
                let existing = get
                    .query_row(params![c.project.0, rel], |r| {
                        Ok((
                            r.get::<_, String>(0)?,
                            r.get::<_, i64>(1)?,
                            r.get::<_, i64>(2)?,
                        ))
                    })
                    .optional()
                    .map_err(storage)?
                    .and_then(|(kind, at, read)| {
                        Some(ItemState {
                            kind: ItemKind::parse(&kind)?,
                            changed_at_ms: at,
                            read: read != 0,
                        })
                    });
                match inbox::apply(existing.as_ref(), c.kind, now_ms) {
                    InboxOp::Upsert(st) => upsert.execute(params![
                        c.project.0,
                        rel,
                        st.kind.as_str(),
                        st.changed_at_ms,
                        st.read as i64
                    ]),
                    InboxOp::Remove => remove.execute(params![c.project.0, rel]),
                    InboxOp::Keep => Ok(0),
                }
                .map_err(storage)?;
            }
        }
        tx.commit().map_err(storage)
    }

    /// The newest `limit` items, newest first (ties: project id, path).
    pub fn list_inbox(&self, limit: usize) -> Result<Vec<InboxRow>, DomainError> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT i.project_id, p.name, i.rel_path, i.kind, i.changed_at, i.read
                 FROM inbox_items i JOIN projects p ON p.id = i.project_id
                 ORDER BY i.changed_at DESC, i.project_id, i.rel_path
                 LIMIT ?1",
            )
            .map_err(storage)?;
        let rows = stmt
            .query_map([limit as i64], |r| {
                Ok(InboxRow {
                    project: ProjectId(r.get(0)?),
                    project_name: r.get(1)?,
                    rel_path: r.get(2)?,
                    kind: ItemKind::parse(&r.get::<_, String>(3)?).unwrap_or(ItemKind::Updated),
                    changed_at_ms: r.get(4)?,
                    read: r.get::<_, i64>(5)? != 0,
                })
            })
            .map_err(storage)?;
        rows.collect::<Result<_, _>>().map_err(storage)
    }

    pub fn unread_counts(&self) -> Result<UnreadCounts, DomainError> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT project_id, COUNT(*) FROM inbox_items WHERE read = 0
                 GROUP BY project_id ORDER BY project_id",
            )
            .map_err(storage)?;
        let by_project: Vec<(ProjectId, u64)> = stmt
            .query_map([], |r| {
                Ok((ProjectId(r.get(0)?), r.get::<_, i64>(1)? as u64))
            })
            .map_err(storage)?
            .collect::<Result<_, _>>()
            .map_err(storage)?;
        Ok(UnreadCounts {
            total: by_project.iter().map(|(_, n)| n).sum(),
            by_project,
        })
    }

    /// Marks one item read. Returns whether an unread item was changed.
    pub fn mark_read(&self, project: ProjectId, rel: &str) -> Result<bool, DomainError> {
        self.conn
            .execute(
                "UPDATE inbox_items SET read = 1 WHERE project_id = ?1 AND rel_path = ?2 AND read = 0",
                params![project.0, rel],
            )
            .map(|n| n > 0)
            .map_err(storage)
    }

    /// Marks every item read. Returns how many changed.
    pub fn mark_all_read(&self) -> Result<usize, DomainError> {
        self.conn
            .execute("UPDATE inbox_items SET read = 1 WHERE read = 0", [])
            .map_err(storage)
    }
}

impl Store {
    pub fn get_setting(&self, key: &str) -> Result<Option<String>, DomainError> {
        self.conn
            .query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| {
                r.get(0)
            })
            .optional()
            .map_err(storage)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), DomainError> {
        self.conn
            .execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                params![key, value],
            )
            .map(|_| ())
            .map_err(storage)
    }
}

pub(crate) fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

fn storage(e: rusqlite::Error) -> DomainError {
    DomainError::Storage(e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn migrates_a_new_database_to_the_latest_version() {
        let store = Store::open_in_memory().unwrap();
        assert_eq!(store.schema_version().unwrap(), MIGRATIONS.len());
    }

    #[test]
    fn inserts_lists_and_deletes_projects() {
        let store = Store::open_in_memory().unwrap();
        let a = store.insert_project("A", "/p/a").unwrap();
        let b = store.insert_project("B", "/p/b").unwrap();
        assert_ne!(a, b);
        assert_eq!(
            store.list_projects().unwrap(),
            [
                StoredProject {
                    id: a,
                    name: "A".into(),
                    path: "/p/a".into()
                },
                StoredProject {
                    id: b,
                    name: "B".into(),
                    path: "/p/b".into()
                },
            ]
        );
        assert!(store.delete_project(a).unwrap());
        assert!(!store.delete_project(a).unwrap());
        assert_eq!(store.list_projects().unwrap().len(), 1);
    }

    #[test]
    fn rejects_a_duplicate_path() {
        let store = Store::open_in_memory().unwrap();
        store.insert_project("A", "/p/a").unwrap();
        assert_eq!(
            store.insert_project("A2", "/p/a"),
            Err(DomainError::AlreadyRegistered)
        );
    }

    #[test]
    fn persists_across_reopen() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("kidock.db");
        let id = Store::open(&path)
            .unwrap()
            .insert_project("A", "/p/a")
            .unwrap();
        let reopened = Store::open(&path).unwrap();
        assert_eq!(reopened.list_projects().unwrap()[0].id, id);
        assert_eq!(reopened.schema_version().unwrap(), MIGRATIONS.len());
    }

    const ST: FileState = FileState {
        size: 3,
        mtime_ns: 42,
        hash: u64::MAX - 1, // exercises the i64 round-trip
    };

    #[test]
    fn stores_and_updates_file_states() {
        let mut store = Store::open_in_memory().unwrap();
        let p = store.insert_project("A", "/p/a").unwrap();
        store
            .apply_file_ops(
                p,
                &[
                    FileOp::Upsert("a.md".into(), ST),
                    FileOp::Upsert("b.md".into(), ST),
                ],
            )
            .unwrap();
        let changed = FileState { size: 4, ..ST };
        store
            .apply_file_ops(
                p,
                &[
                    FileOp::Upsert("a.md".into(), changed),
                    FileOp::Delete("b.md".into()),
                ],
            )
            .unwrap();
        let states = store.file_states(p).unwrap();
        assert_eq!(states.len(), 1);
        assert_eq!(states["a.md"], changed);
    }

    #[test]
    fn file_states_are_dropped_with_the_project() {
        let mut store = Store::open_in_memory().unwrap();
        let p = store.insert_project("A", "/p/a").unwrap();
        store
            .apply_file_ops(p, &[FileOp::Upsert("a.md".into(), ST)])
            .unwrap();
        store.delete_project(p).unwrap();
        assert!(store.file_states(p).unwrap().is_empty());
    }

    #[test]
    fn tracks_whether_a_project_was_baselined() {
        let store = Store::open_in_memory().unwrap();
        let p = store.insert_project("A", "/p/a").unwrap();
        assert!(!store.is_baselined(p).unwrap());
        store.mark_baselined(p).unwrap();
        assert!(store.is_baselined(p).unwrap());
    }

    #[test]
    fn upgrades_a_v1_database_keeping_projects() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("kidock.db");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(MIGRATIONS[0]).unwrap();
            conn.pragma_update(None, "user_version", 1_i64).unwrap();
            conn.execute(
                "INSERT INTO projects (name, path, created_at) VALUES ('Old', '/p/old', 0)",
                [],
            )
            .unwrap();
        }
        let store = Store::open(&path).unwrap();
        assert_eq!(store.schema_version().unwrap(), MIGRATIONS.len());
        let projects = store.list_projects().unwrap();
        assert_eq!(projects[0].name, "Old");
        assert!(!store.is_baselined(projects[0].id).unwrap());
    }

    fn change(project: ProjectId, rel: &str, kind: crate::domain::ChangeKind) -> ProjectChange {
        ProjectChange {
            project,
            rel: crate::domain::RelPath::parse(rel).unwrap(),
            kind,
        }
    }

    #[test]
    fn records_changes_as_one_item_per_file_newest_first() {
        use crate::domain::ChangeKind::*;
        let mut store = Store::open_in_memory().unwrap();
        let p = store.insert_project("Reports", "/p/a").unwrap();
        store
            .record_changes(&[change(p, "a.md", Created)], 10)
            .unwrap();
        store
            .record_changes(&[change(p, "b.md", Updated)], 20)
            .unwrap();
        store
            .record_changes(&[change(p, "a.md", Updated)], 30)
            .unwrap();

        let items = store.list_inbox(100).unwrap();
        let summary: Vec<_> = items
            .iter()
            .map(|i| (i.rel_path.as_str(), i.kind, i.changed_at_ms, i.read))
            .collect();
        // a.md moved to the top; still "created" because it was never read.
        assert_eq!(
            summary,
            [
                ("a.md", ItemKind::Created, 30, false),
                ("b.md", ItemKind::Updated, 20, false)
            ]
        );
        assert_eq!(items[0].project_name, "Reports");
        assert_eq!(store.list_inbox(1).unwrap().len(), 1);
    }

    #[test]
    fn deletions_remove_items_and_reads_are_counted() {
        use crate::domain::ChangeKind::*;
        let mut store = Store::open_in_memory().unwrap();
        let p = store.insert_project("A", "/p/a").unwrap();
        let q = store.insert_project("B", "/p/b").unwrap();
        store
            .record_changes(
                &[
                    change(p, "a.md", Created),
                    change(p, "b.md", Created),
                    change(q, "c.md", Updated),
                ],
                1,
            )
            .unwrap();
        assert_eq!(
            store.unread_counts().unwrap(),
            UnreadCounts {
                total: 3,
                by_project: vec![(p, 2), (q, 1)]
            }
        );

        assert!(store.mark_read(p, "a.md").unwrap());
        assert!(!store.mark_read(p, "a.md").unwrap());
        assert!(!store.mark_read(p, "missing.md").unwrap());
        store
            .record_changes(&[change(p, "b.md", Deleted)], 2)
            .unwrap();
        assert_eq!(store.unread_counts().unwrap().by_project, vec![(q, 1)]);
        assert_eq!(store.list_inbox(10).unwrap().len(), 2);

        assert_eq!(store.mark_all_read().unwrap(), 1);
        assert_eq!(store.unread_counts().unwrap(), UnreadCounts::default());
    }

    #[test]
    fn a_read_item_becomes_unread_again_on_change() {
        use crate::domain::ChangeKind::*;
        let mut store = Store::open_in_memory().unwrap();
        let p = store.insert_project("A", "/p/a").unwrap();
        store
            .record_changes(&[change(p, "a.md", Created)], 1)
            .unwrap();
        store.mark_read(p, "a.md").unwrap();
        store
            .record_changes(&[change(p, "a.md", Updated)], 2)
            .unwrap();
        let item = &store.list_inbox(1).unwrap()[0];
        assert_eq!((item.kind, item.read), (ItemKind::Updated, false));
    }

    #[test]
    fn inbox_items_are_dropped_with_the_project() {
        use crate::domain::ChangeKind::*;
        let mut store = Store::open_in_memory().unwrap();
        let p = store.insert_project("A", "/p/a").unwrap();
        store
            .record_changes(&[change(p, "a.md", Created)], 1)
            .unwrap();
        store.delete_project(p).unwrap();
        assert!(store.list_inbox(10).unwrap().is_empty());
        assert_eq!(store.unread_counts().unwrap().total, 0);
    }

    #[test]
    fn stores_settings() {
        let store = Store::open_in_memory().unwrap();
        assert_eq!(store.get_setting("k").unwrap(), None);
        store.set_setting("k", "1").unwrap();
        store.set_setting("k", "0").unwrap();
        assert_eq!(store.get_setting("k").unwrap().as_deref(), Some("0"));
    }

    #[test]
    fn refuses_a_database_from_a_newer_app() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("kidock.db");
        {
            let conn = Connection::open(&path).unwrap();
            conn.pragma_update(None, "user_version", 99_i64).unwrap();
        }
        assert!(matches!(Store::open(&path), Err(DomainError::Storage(_))));
    }
}
