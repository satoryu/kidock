use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, RwLock, RwLockReadGuard, RwLockWriteGuard};

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
    /// Current exclusion rules; callers take a snapshot per operation.
    rules: RwLock<Arc<ExclusionRules>>,
}

/// Settings key for the exclusion patterns (JSON array of strings; absent = defaults).
pub const EXCLUSION_PATTERNS: &str = "exclusions.patterns";

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
        // Unreadable or invalid stored patterns fall back to the defaults.
        let rules = store
            .get_setting(EXCLUSION_PATTERNS)?
            .and_then(|json| serde_json::from_str::<Vec<String>>(&json).ok())
            .and_then(|p| ExclusionRules::from_patterns(&p).ok())
            .unwrap_or_default();
        Ok(Self {
            store: Mutex::new(store),
            projects: RwLock::new(projects),
            watchers: Mutex::new(None),
            notifications_enabled: AtomicBool::new(notifications_enabled),
            rules: RwLock::new(Arc::new(rules)),
        })
    }

    /// A snapshot of the current exclusion rules.
    pub fn rules(&self) -> Arc<ExclusionRules> {
        self.rules.read().expect("rules lock poisoned").clone()
    }

    /// Persists and applies new rules, then silently re-baselines every
    /// available project (no Inbox items or notifications).
    pub fn set_rules(&self, rules: ExclusionRules) -> Result<(), DomainError> {
        let json = serde_json::to_string(rules.patterns())
            .map_err(|e| DomainError::Storage(e.to_string()))?;
        self.store().set_setting(EXCLUSION_PATTERNS, &json)?;
        *self.rules.write().expect("rules lock poisoned") = Arc::new(rules);
        let ids: Vec<ProjectId> = self
            .projects_read()
            .values()
            .filter(|p| p.available)
            .map(|p| p.id)
            .collect();
        if let Some(w) = self
            .watchers
            .lock()
            .expect("watchers lock poisoned")
            .as_ref()
        {
            for id in ids {
                w.send(Msg::Baseline(id));
            }
        }
        Ok(())
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
    fn exclusion_rules_default_and_persist() {
        let dir = TempDir::new().unwrap();
        let db = dir.path().join("kidock.db");
        let state = AppState::load(Store::open(&db).unwrap()).unwrap();
        assert_eq!(*state.rules(), ExclusionRules::default());
        state
            .set_rules(ExclusionRules::from_patterns(&["scratch"]).unwrap())
            .unwrap();
        assert!(state.rules().is_excluded("scratch"));
        drop(state);
        let reloaded = AppState::load(Store::open(&db).unwrap()).unwrap();
        assert_eq!(reloaded.rules().patterns(), ["scratch"]);
    }

    #[test]
    fn invalid_stored_patterns_fall_back_to_defaults() {
        let store = Store::open_in_memory().unwrap();
        store.set_setting(EXCLUSION_PATTERNS, "not json").unwrap();
        assert_eq!(
            *AppState::load(store).unwrap().rules(),
            ExclusionRules::default()
        );
    }

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
