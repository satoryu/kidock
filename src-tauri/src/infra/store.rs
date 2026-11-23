//! Persistent state in SQLite, owned by the backend.
//!
//! The schema is versioned with `PRAGMA user_version`; each entry in
//! [`MIGRATIONS`] upgrades the database by one version inside a transaction.

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OptionalExtension, params};

use crate::domain::{DomainError, ProjectId};

/// Schema migrations, applied in order. Index `i` upgrades version `i` → `i + 1`.
const MIGRATIONS: &[&str] = &[
    // v1 (#5): registered projects.
    "CREATE TABLE projects (
        id         INTEGER PRIMARY KEY,
        name       TEXT    NOT NULL,
        path       TEXT    NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
    );",
];

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

fn now_millis() -> i64 {
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
