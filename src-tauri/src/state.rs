use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, RwLock, RwLockReadGuard, RwLockWriteGuard};

use crate::domain::{DomainError, ExclusionRules, Project, ProjectId, RootFolder};
use crate::infra::fs_reader;
use crate::infra::store::Store;

/// Process-wide state managed by Tauri.
///
/// `projects` caches the `projects` table so file commands don't touch SQLite.
/// Writers take the `projects` write lock first, then the store, and keep both
/// for the whole check-and-insert, so concurrent adds cannot race.
#[derive(Debug)]
pub struct AppState {
    store: Mutex<Store>,
    projects: RwLock<BTreeMap<ProjectId, Project>>,
    pub rules: ExclusionRules,
}

impl AppState {
    /// Loads every stored project. A folder that no longer resolves to a
    /// directory is kept (so it can be shown and removed) but marked unavailable.
    pub fn load(store: Store) -> Result<Self, DomainError> {
        let projects = store
            .list_projects()?
            .into_iter()
            .map(|row| {
                let (folder, available) = match fs_reader::open_root(&PathBuf::from(&row.path)) {
                    Ok(folder) => (folder, true),
                    Err(_) => (RootFolder::new(PathBuf::from(&row.path)), false),
                };
                let project = Project {
                    id: row.id,
                    name: row.name,
                    folder,
                    available,
                };
                (row.id, project)
            })
            .collect();
        Ok(Self {
            store: Mutex::new(store),
            projects: RwLock::new(projects),
            rules: ExclusionRules::default(),
        })
    }

    /// A clone of the project, so no lock is held during file I/O.
    pub fn project(&self, id: ProjectId) -> Result<Project, DomainError> {
        self.projects_read()
            .get(&id)
            .cloned()
            .ok_or(DomainError::ProjectNotFound)
    }

    pub fn projects_read(&self) -> RwLockReadGuard<'_, BTreeMap<ProjectId, Project>> {
        self.projects.read().expect("projects lock poisoned")
    }

    pub fn projects_write(&self) -> RwLockWriteGuard<'_, BTreeMap<ProjectId, Project>> {
        self.projects.write().expect("projects lock poisoned")
    }

    pub fn store(&self) -> MutexGuard<'_, Store> {
        self.store.lock().expect("store lock poisoned")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn load_marks_missing_folders_unavailable() {
        let dir = TempDir::new().unwrap();
        let present = dunce::canonicalize(dir.path()).unwrap();
        let missing = present.join("gone");
        let store = Store::open_in_memory().unwrap();
        let a = store
            .insert_project("present", &present.to_string_lossy())
            .unwrap();
        let b = store
            .insert_project("gone", &missing.to_string_lossy())
            .unwrap();

        let state = AppState::load(store).unwrap();
        let pa = state.project(a).unwrap();
        assert!(pa.available);
        assert_eq!(pa.folder.canonical_path, present);
        let pb = state.project(b).unwrap();
        assert!(!pb.available);
        assert_eq!(pb.folder.canonical_path, missing);
        assert_eq!(
            state.project(ProjectId(999)),
            Err(DomainError::ProjectNotFound)
        );
    }
}
