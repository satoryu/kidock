//! Delivering detected changes: record them in the Inbox, then tell the WebView.

use std::sync::Weak;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

use crate::domain::ProjectChange;
use crate::domain::notice::NoticeItem;
use crate::infra::detector::ChangeSink;
use crate::infra::notifier::NotifierHandle;
use crate::infra::store::now_millis;
use crate::state::AppState;

/// Event name the frontend listens to.
pub const CHANGES_EVENT: &str = "kidock://changes";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChangeDto {
    pub project_id: i64,
    pub rel_path: String,
    pub kind: &'static str,
}

impl From<&ProjectChange> for FileChangeDto {
    fn from(c: &ProjectChange) -> Self {
        Self {
            project_id: c.project.0,
            rel_path: c.rel.to_wire(),
            kind: c.kind.as_str(),
        }
    }
}

/// Records each batch in the Inbox, then emits it as one `kidock://changes`
/// event. Writing first guarantees that the UI's refetch sees the new items.
pub struct AppSink<R: Runtime> {
    /// Weak: the state owns the watchers, which feed the detector holding this sink.
    state: Weak<AppState>,
    app: AppHandle<R>,
    notifier: Option<NotifierHandle>,
}

impl<R: Runtime> AppSink<R> {
    pub fn new(state: Weak<AppState>, app: AppHandle<R>, notifier: Option<NotifierHandle>) -> Self {
        Self {
            state,
            app,
            notifier,
        }
    }
}

/// Changes as notification items, with project names from the cache.
pub fn notice_items(state: &AppState, changes: &[ProjectChange]) -> Vec<NoticeItem> {
    changes
        .iter()
        .filter_map(|c| {
            let project = state.project(c.project).ok()?;
            Some(NoticeItem {
                project: c.project,
                project_name: project.name,
                rel: c.rel.clone(),
                kind: c.kind,
            })
        })
        .collect()
}

/// Records `changes` in the Inbox (shared by `AppSink` and tests).
pub fn record_in_inbox(state: &AppState, changes: &[ProjectChange]) {
    if let Err(e) = state.store().record_changes(changes, now_millis()) {
        eprintln!("kidock: failed to record changes in the Inbox: {e}");
    }
}

impl<R: Runtime> ChangeSink for AppSink<R> {
    fn deliver(&self, changes: &[ProjectChange]) {
        if let Some(state) = self.state.upgrade() {
            record_in_inbox(&state, changes);
            if let Some(n) = &self.notifier {
                n.notify(notice_items(&state, changes));
            }
        }
        // Emit even if recording failed, so the tree still refreshes.
        let payload: Vec<FileChangeDto> = changes.iter().map(FileChangeDto::from).collect();
        if let Err(e) = self.app.emit(CHANGES_EVENT, payload) {
            eprintln!("kidock: failed to emit changes: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{ChangeKind, ProjectId, RelPath};

    #[test]
    fn serializes_changes_for_the_frontend() {
        let c = ProjectChange {
            project: ProjectId(3),
            rel: RelPath::parse("docs/a.md").unwrap(),
            kind: ChangeKind::Updated,
        };
        assert_eq!(
            serde_json::to_value(FileChangeDto::from(&c)).unwrap(),
            serde_json::json!({ "projectId": 3, "relPath": "docs/a.md", "kind": "updated" })
        );
    }
}
