//! Showing notices as OS notifications (tauri-plugin-notification), and
//! routing clicks back into the app.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicI32, Ordering};
use std::sync::{Mutex, Weak};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_notification::NotificationExt;

use crate::domain::notice::{Notice, NoticeTarget};
use crate::infra::notifier::Presenter;
use crate::state::AppState;

/// Event asking the UI to open a file (or the Inbox) after a notification click.
pub const OPEN_EVENT: &str = "kidock://open";
/// How many shown notifications remember their click target.
const REMEMBERED: usize = 100;
const MAIN_WINDOW: &str = "main";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenRequestDto {
    /// `None` means "show the Inbox".
    pub project_id: Option<i64>,
    pub rel_path: Option<String>,
}

impl From<&NoticeTarget> for OpenRequestDto {
    fn from(t: &NoticeTarget) -> Self {
        match t {
            NoticeTarget::File { project, rel } => Self {
                project_id: Some(project.0),
                rel_path: Some(rel.to_wire()),
            },
            NoticeTarget::Inbox => Self {
                project_id: None,
                rel_path: None,
            },
        }
    }
}

pub struct TauriPresenter<R: Runtime> {
    app: AppHandle<R>,
    state: Weak<AppState>,
    next_id: AtomicI32,
    targets: Mutex<VecDeque<(i32, NoticeTarget)>>,
}

impl<R: Runtime> TauriPresenter<R> {
    pub fn new(app: AppHandle<R>, state: Weak<AppState>) -> Self {
        Self {
            app,
            state,
            next_id: AtomicI32::new(1),
            targets: Mutex::new(VecDeque::new()),
        }
    }

    /// A click on notification `id`: bring the window forward and open its target.
    pub fn on_tap(&self, id: i32) {
        if let Some(w) = self.app.get_webview_window(MAIN_WINDOW) {
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_focus();
        }
        let target = self
            .targets
            .lock()
            .expect("targets lock poisoned")
            .iter()
            .find(|(i, _)| *i == id)
            .map(|(_, t)| t.clone())
            .unwrap_or(NoticeTarget::Inbox);
        if let Err(e) = self.app.emit(OPEN_EVENT, OpenRequestDto::from(&target)) {
            eprintln!("kidock: failed to emit open request: {e}");
        }
    }
}

impl<R: Runtime> Presenter for TauriPresenter<R> {
    fn should_show(&self) -> bool {
        let enabled = self
            .state
            .upgrade()
            .is_some_and(|s| s.notifications_enabled());
        // The Inbox already shows changes while the window is focused.
        let focused = self
            .app
            .get_webview_window(MAIN_WINDOW)
            .and_then(|w| w.is_focused().ok())
            .unwrap_or(false);
        enabled && !focused
    }

    fn show(&self, notice: Notice) {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        {
            let mut targets = self.targets.lock().expect("targets lock poisoned");
            targets.push_back((id, notice.target.clone()));
            while targets.len() > REMEMBERED {
                targets.pop_front();
            }
        }
        let result = self
            .app
            .notification()
            .builder()
            .id(id)
            .title(&notice.title)
            .body(&notice.body)
            .show();
        if let Err(e) = result {
            eprintln!("kidock: failed to show a notification: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{ProjectId, RelPath};

    #[test]
    fn open_requests_serialize_for_the_frontend() {
        let file = NoticeTarget::File {
            project: ProjectId(2),
            rel: RelPath::parse("a/b.md").unwrap(),
        };
        assert_eq!(
            serde_json::to_value(OpenRequestDto::from(&file)).unwrap(),
            serde_json::json!({ "projectId": 2, "relPath": "a/b.md" })
        );
        assert_eq!(
            serde_json::to_value(OpenRequestDto::from(&NoticeTarget::Inbox)).unwrap(),
            serde_json::json!({ "projectId": null, "relPath": null })
        );
    }
}
