//! One debounced, recursive filesystem watcher per project. Watchers only
//! nominate paths; the detector decides what actually changed.

use std::collections::HashMap;
use std::path::Path;
use std::sync::mpsc::Sender;
use std::time::Duration;

use notify_debouncer_full::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{DebounceEventResult, Debouncer, RecommendedCache, new_debouncer};

use crate::domain::{DomainError, ProjectId};
use crate::infra::detector::Msg;

/// Debounce window: bursts (an agent writing many files) arrive as one batch.
pub const DEBOUNCE: Duration = Duration::from_millis(500);

pub struct Watchers {
    tx: Sender<Msg>,
    debounce: Duration,
    active: HashMap<ProjectId, Debouncer<RecommendedWatcher, RecommendedCache>>,
}

impl std::fmt::Debug for Watchers {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Watchers")
            .field("active", &self.active.keys().collect::<Vec<_>>())
            .finish_non_exhaustive()
    }
}

impl Watchers {
    pub fn new(tx: Sender<Msg>, debounce: Duration) -> Self {
        Self {
            tx,
            debounce,
            active: HashMap::new(),
        }
    }

    /// Queues work for the detector (ignored if it has stopped).
    pub fn send(&self, msg: Msg) {
        let _ = self.tx.send(msg);
    }

    /// Starts watching `root` (canonical) recursively. Replaces any existing
    /// watcher for the project.
    pub fn start(&mut self, project: ProjectId, root: &Path) -> Result<(), DomainError> {
        let tx = self.tx.clone();
        let mut debouncer =
            new_debouncer(self.debounce, None, move |result: DebounceEventResult| {
                let msg = match result {
                    Ok(events) if events.iter().any(|e| e.need_rescan()) => Msg::Rescan(project),
                    Ok(events) => Msg::Paths {
                        project,
                        paths: events.into_iter().flat_map(|e| e.event.paths).collect(),
                    },
                    // Errors may mean missed events: reconcile everything.
                    Err(_) => Msg::Rescan(project),
                };
                let _ = tx.send(msg);
            })
            .map_err(|e| DomainError::Io(format!("failed to create a watcher: {e}")))?;
        debouncer
            .watch(root, RecursiveMode::Recursive)
            .map_err(|e| DomainError::Io(format!("failed to watch {}: {e}", root.display())))?;
        self.active.insert(project, debouncer);
        Ok(())
    }

    /// Stops watching (dropping the debouncer stops its threads).
    pub fn stop(&mut self, project: ProjectId) {
        if let Some(d) = self.active.remove(&project) {
            d.stop_nonblocking();
        }
    }

    pub fn is_watching(&self, project: ProjectId) -> bool {
        self.active.contains_key(&project)
    }
}
