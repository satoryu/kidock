use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use crate::domain::{ExclusionRules, RootFolder, RootId};

/// Process-wide state managed by Tauri.
#[derive(Debug, Default)]
pub struct AppState {
    pub root: Mutex<Option<RootFolder>>,
    pub rules: ExclusionRules,
    next_root_id: AtomicU64,
}

impl AppState {
    pub fn next_root_id(&self) -> RootId {
        RootId(self.next_root_id.fetch_add(1, Ordering::Relaxed) + 1)
    }

    /// A clone of the current root, so the lock is not held during I/O.
    pub fn current_root(&self) -> Option<RootFolder> {
        self.root.lock().expect("root lock poisoned").clone()
    }
}
