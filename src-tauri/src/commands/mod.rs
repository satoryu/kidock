//! Thin Tauri command handlers. Each `#[tauri::command]` delegates to a plain
//! function that takes `&AppState`, so the wiring is testable without a runtime.
//!
//! Commands are declared `#[tauri::command(async)]` so they run on Tauri's
//! thread pool: plain sync commands run on the main thread, where slow I/O
//! (huge directories, network drives) would freeze the UI.

mod error;

use std::path::Path;

use serde::Serialize;
use tauri::{AppHandle, Runtime, State};

pub use error::CommandError;

use crate::domain::{DomainError, EntryKind, RelPath, RootFolder, TreeEntry};
use crate::infra::{asset_scope, fs_reader};
use crate::state::AppState;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RootInfo {
    pub id: u64,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntryDto {
    pub name: String,
    pub rel_path: String,
    pub kind: &'static str,
}

impl From<&RootFolder> for RootInfo {
    fn from(root: &RootFolder) -> Self {
        Self {
            id: root.id.0,
            name: root.display_name(),
            path: root.canonical_path.to_string_lossy().into_owned(),
        }
    }
}

impl From<TreeEntry> for TreeEntryDto {
    fn from(e: TreeEntry) -> Self {
        Self {
            rel_path: e.rel_path.to_wire(),
            name: e.name,
            kind: match e.kind {
                EntryKind::Dir => "dir",
                EntryKind::Markdown => "markdown",
            },
        }
    }
}

/// Opens `path` as the root, replacing the current one only on success.
pub fn do_set_root(state: &AppState, path: &Path) -> Result<RootFolder, CommandError> {
    let root = fs_reader::open_root(state.next_root_id(), path)?;
    *state.root.lock().expect("root lock poisoned") = Some(root.clone());
    Ok(root)
}

pub fn do_list_dir(state: &AppState, rel: &str) -> Result<Vec<TreeEntryDto>, CommandError> {
    let (root, rel) = root_and_rel(state, rel)?;
    let entries = fs_reader::list_dir(&root, &rel, &state.rules)?;
    Ok(entries.into_iter().map(TreeEntryDto::from).collect())
}

pub fn do_read_markdown(state: &AppState, rel: &str) -> Result<String, CommandError> {
    let (root, rel) = root_and_rel(state, rel)?;
    Ok(fs_reader::read_markdown(&root, &rel)?)
}

fn root_and_rel(state: &AppState, rel: &str) -> Result<(RootFolder, RelPath), DomainError> {
    let root = state.current_root().ok_or(DomainError::NoRootSelected)?;
    Ok((root, RelPath::parse(rel)?))
}

#[tauri::command(async)]
pub fn set_root<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    path: String,
) -> Result<RootInfo, CommandError> {
    let root = do_set_root(&state, Path::new(&path))?;
    asset_scope::allow_root(&app, &root)?;
    Ok(RootInfo::from(&root))
}

#[tauri::command(async)]
pub fn list_dir(
    state: State<'_, AppState>,
    rel: String,
) -> Result<Vec<TreeEntryDto>, CommandError> {
    do_list_dir(&state, &rel)
}

#[tauri::command(async)]
pub fn read_markdown(state: State<'_, AppState>, rel: String) -> Result<String, CommandError> {
    do_read_markdown(&state, &rel)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn commands_require_a_root() {
        let state = AppState::default();
        assert_eq!(do_list_dir(&state, "").unwrap_err().kind, "NoRootSelected");
        assert_eq!(
            do_read_markdown(&state, "a.md").unwrap_err().kind,
            "NoRootSelected"
        );
    }

    #[test]
    fn set_root_then_list_and_read() {
        let dir = TempDir::new().unwrap();
        fs::create_dir(dir.path().join("docs")).unwrap();
        fs::write(dir.path().join("docs/a.md"), "# A").unwrap();
        let state = AppState::default();

        let root = do_set_root(&state, dir.path()).unwrap();
        assert_eq!(root.id.0, 1);

        let top = do_list_dir(&state, "").unwrap();
        assert_eq!(
            top,
            [TreeEntryDto {
                name: "docs".into(),
                rel_path: "docs".into(),
                kind: "dir"
            }]
        );
        let docs = do_list_dir(&state, "docs").unwrap();
        assert_eq!(docs[0].rel_path, "docs/a.md");
        assert_eq!(docs[0].kind, "markdown");
        assert_eq!(do_read_markdown(&state, "docs/a.md").unwrap(), "# A");
    }

    #[test]
    fn set_root_replaces_the_previous_root_with_a_new_id() {
        let a = TempDir::new().unwrap();
        let b = TempDir::new().unwrap();
        fs::write(b.path().join("only-b.md"), "b").unwrap();
        let state = AppState::default();
        do_set_root(&state, a.path()).unwrap();
        let root_b = do_set_root(&state, b.path()).unwrap();
        assert_eq!(root_b.id.0, 2);
        assert_eq!(do_read_markdown(&state, "only-b.md").unwrap(), "b");
    }

    #[test]
    fn failed_set_root_keeps_the_previous_root() {
        let a = TempDir::new().unwrap();
        fs::write(a.path().join("a.md"), "a").unwrap();
        let state = AppState::default();
        do_set_root(&state, a.path()).unwrap();
        let err = do_set_root(&state, &a.path().join("missing")).unwrap_err();
        assert_eq!(err.kind, "NotFound");
        assert_eq!(do_read_markdown(&state, "a.md").unwrap(), "a");
    }

    #[test]
    fn traversal_and_absolute_paths_are_rejected() {
        let dir = TempDir::new().unwrap();
        let state = AppState::default();
        do_set_root(&state, dir.path()).unwrap();
        for rel in ["../../etc/hosts", "/etc/hosts", r"\Windows\win.ini"] {
            assert_eq!(
                do_read_markdown(&state, rel).unwrap_err().kind,
                "OutsideRoot",
                "{rel}"
            );
            assert_eq!(
                do_list_dir(&state, rel).unwrap_err().kind,
                "OutsideRoot",
                "{rel}"
            );
        }
        assert_eq!(
            do_read_markdown(&state, "C:/x.md").unwrap_err().kind,
            "InvalidPath"
        );
    }
}
