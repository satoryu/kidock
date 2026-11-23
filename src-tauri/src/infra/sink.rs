//! Delivering detected changes to the WebView.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

use crate::domain::ProjectChange;
use crate::infra::detector::ChangeSink;

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

/// Emits each batch as one `kidock://changes` event.
pub struct TauriSink<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> TauriSink<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        Self { app }
    }
}

impl<R: Runtime> ChangeSink for TauriSink<R> {
    fn deliver(&self, changes: &[ProjectChange]) {
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
