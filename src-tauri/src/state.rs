use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard, RwLock, RwLockReadGuard, RwLockWriteGuard};

use crate::domain::{DomainError, ExclusionRules, Project, ProjectId, RootFolder};
use crate::infra::detector::Msg;
use crate::infra::fs_reader;
use crate::infra::store::Store;
use crate::infra::watcher::Watchers;

/// Process-wide state managed by Tauri.
///
/// `projects` caches the `projects` table so file commands don't touch SQLite.
/// Lock order: `projects` → `store` → `watchers`. Writers take the `projects`
/// write lock first and keep it for the whole check-and-insert, so concurrent
/// adds cannot race. The detector never holds two of these at once.
#[derive(Debug)]
pub struct AppState {
    store: Mutex<Store>,
    projects: RwLock<BTreeMap<ProjectId, Project>>,
    /// Set once the detector thread runs (absent in unit tests).
    watchers: Mutex<Option<Watchers>>,
    /// Cached `notifications.enabled` setting (read on every notification).
    notifications_enabled: AtomicBool,
    pub rules: ExclusionRules,
}

/// Settings key for the OS-notification toggle ("1" / "0"; absent = on).
pub const NOTIFICATIONS_ENABLED: &str = "notifications.enabled";

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
        let notifications_enabled =
            store.get_setting(NOTIFICATIONS_ENABLED)?.as_deref() != Some("0");
        Ok(Self {
            store: Mutex::new(store),
            projects: RwLock::new(projects),
            watchers: Mutex::new(None),
            notifications_enabled: AtomicBool::new(notifications_enabled),
            rules: ExclusionRules::default(),
        })
    }

    pub fn notifications_enabled(&self) -> bool {
        self.notifications_enabled.load(Ordering::Relaxed)
    }

    pub fn set_notifications_enabled(&self, enabled: bool) -> Result<(), DomainError> {
        self.store()
            .set_setting(NOTIFICATIONS_ENABLED, if enabled { "1" } else { "0" })?;
        self.notifications_enabled.store(enabled, Ordering::Relaxed);
        Ok(())
    }

    pub fn set_watchers(&self, watchers: Watchers) {
        *self.watchers.lock().expect("watchers lock poisoned") = Some(watchers);
    }

    /// Takes a silent baseline of a newly added project, then watches it.
    /// The detector queue is serial, so the baseline precedes any events.
    pub fn watch_new_project(&self, project: &Project) -> Result<(), DomainError> {
        let mut guard = self.watchers.lock().expect("watchers lock poisoned");
        let Some(w) = guard.as_mut() else {
            return Ok(());
        };
        w.send(Msg::Baseline(project.id));
        w.start(project.id, &project.folder.canonical_path)
    }

    pub fn unwatch_project(&self, id: ProjectId) {
        if let Some(w) = self
            .watchers
            .lock()
            .expect("watchers lock poisoned")
            .as_mut()
        {
            w.stop(id);
        }
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
    fn notifications_toggle_defaults_on_and_persists() {
        let dir = TempDir::new().unwrap();
        let db = dir.path().join("kidock.db");
        let state = AppState::load(Store::open(&db).unwrap()).unwrap();
        assert!(state.notifications_enabled());
        state.set_notifications_enabled(false).unwrap();
        assert!(!state.notifications_enabled());
        drop(state);
        let reloaded = AppState::load(Store::open(&db).unwrap()).unwrap();
        assert!(!reloaded.notifications_enabled());
    }

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
