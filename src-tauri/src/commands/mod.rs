//! Thin Tauri command handlers. Each `#[tauri::command]` delegates to a plain
//! function that takes `&AppState`, so the wiring is testable without a runtime.
//!
//! Commands are declared `#[tauri::command(async)]` so they run on Tauri's
//! thread pool: plain sync commands run on the main thread, where slow I/O
//! (huge directories, network drives, SQLite) would freeze the UI.

mod error;

use std::path::Path;
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Runtime, State};

pub use error::CommandError;

use crate::domain::percent::is_external_url;
use crate::domain::{
    DomainError, EntryKind, Project, ProjectId, RelPath, TreeEntry, check_overlap, project_name,
};
use crate::infra::fs_reader;
use crate::infra::store::{InboxRow, UnreadCounts};
use crate::state::AppState;

/// How many Inbox items are listed (older ones are kept and counted).
pub const INBOX_LIMIT: usize = 500;

/// File systems on these platforms are case-insensitive by default.
const CASE_INSENSITIVE_FS: bool = cfg!(any(windows, target_os = "macos"));

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub available: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntryDto {
    pub name: String,
    pub rel_path: String,
    pub kind: &'static str,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxItemDto {
    pub project_id: i64,
    pub project_name: String,
    pub rel_path: String,
    pub kind: &'static str,
    /// Milliseconds since the Unix epoch.
    pub changed_at: i64,
    pub read: bool,
}

impl From<InboxRow> for InboxItemDto {
    fn from(r: InboxRow) -> Self {
        Self {
            project_id: r.project.0,
            project_name: r.project_name,
            rel_path: r.rel_path,
            kind: r.kind.as_str(),
            changed_at: r.changed_at_ms,
            read: r.read,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectUnreadDto {
    pub project_id: i64,
    pub unread: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxCountsDto {
    pub total: u64,
    pub by_project: Vec<ProjectUnreadDto>,
}

impl From<UnreadCounts> for InboxCountsDto {
    fn from(c: UnreadCounts) -> Self {
        Self {
            total: c.total,
            by_project: c
                .by_project
                .into_iter()
                .map(|(id, unread)| ProjectUnreadDto {
                    project_id: id.0,
                    unread,
                })
                .collect(),
        }
    }
}

impl From<&Project> for ProjectInfo {
    fn from(p: &Project) -> Self {
        Self {
            id: p.id.0,
            name: p.name.clone(),
            path: p.folder.canonical_path.to_string_lossy().into_owned(),
            available: p.available,
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

/// All projects, sorted by name (case-insensitive), then id.
pub fn do_list_projects(state: &AppState) -> Vec<ProjectInfo> {
    let mut list: Vec<ProjectInfo> = state
        .projects_read()
        .values()
        .map(ProjectInfo::from)
        .collect();
    list.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then(a.id.cmp(&b.id))
    });
    list
}

/// Registers `path` as a project. Rejects folders that overlap an existing project.
pub fn do_add_project(
    state: &AppState,
    name: Option<&str>,
    path: &Path,
) -> Result<Project, CommandError> {
    let folder = fs_reader::open_root(path)?;
    let mut projects = state.projects_write();
    let existing: Vec<&Path> = projects
        .values()
        .map(|p| p.folder.canonical_path.as_path())
        .collect();
    check_overlap(&existing, &folder.canonical_path, CASE_INSENSITIVE_FS)?;

    let name = project_name(name, &folder);
    let id = state
        .store()
        .insert_project(&name, &folder.canonical_path.to_string_lossy())?;
    let project = Project {
        id,
        name,
        folder,
        available: true,
    };
    projects.insert(id, project.clone());
    // A watcher failure (e.g. OS limits) must not undo the registration;
    // the project still works, it just won't report changes.
    if let Err(e) = state.watch_new_project(&project) {
        eprintln!(
            "kidock: cannot watch {}: {e}",
            project.folder.canonical_path.display()
        );
    }
    Ok(project)
}

/// Unregisters a project. Files on disk are never touched.
pub fn do_remove_project(state: &AppState, id: ProjectId) -> Result<(), CommandError> {
    let mut projects = state.projects_write();
    if !projects.contains_key(&id) {
        return Err(DomainError::ProjectNotFound.into());
    }
    state.store().delete_project(id)?;
    projects.remove(&id);
    state.unwatch_project(id);
    Ok(())
}

pub fn do_list_dir(
    state: &AppState,
    id: ProjectId,
    rel: &str,
) -> Result<Vec<TreeEntryDto>, CommandError> {
    let (project, rel) = project_and_rel(state, id, rel)?;
    let entries = fs_reader::list_dir(&project.folder, &rel, &state.rules)?;
    Ok(entries.into_iter().map(TreeEntryDto::from).collect())
}

pub fn do_read_markdown(
    state: &AppState,
    id: ProjectId,
    rel: &str,
) -> Result<String, CommandError> {
    let (project, rel) = project_and_rel(state, id, rel)?;
    Ok(fs_reader::read_markdown(&project.folder, &rel)?)
}

pub fn do_list_inbox(state: &AppState) -> Result<Vec<InboxItemDto>, CommandError> {
    let rows = state.store().list_inbox(INBOX_LIMIT)?;
    Ok(rows.into_iter().map(InboxItemDto::from).collect())
}

pub fn do_inbox_counts(state: &AppState) -> Result<InboxCountsDto, CommandError> {
    Ok(state.store().unread_counts()?.into())
}

/// Marks a file's Inbox item read; `false` if it had none or was already read.
pub fn do_mark_read(state: &AppState, id: ProjectId, rel: &str) -> Result<bool, CommandError> {
    let rel = RelPath::parse(rel)?;
    Ok(state.store().mark_read(id, &rel.to_wire())?)
}

pub fn do_mark_all_read(state: &AppState) -> Result<usize, CommandError> {
    Ok(state.store().mark_all_read()?)
}

pub fn do_set_notifications_enabled(state: &AppState, enabled: bool) -> Result<(), CommandError> {
    Ok(state.set_notifications_enabled(enabled)?)
}

fn project_and_rel(
    state: &AppState,
    id: ProjectId,
    rel: &str,
) -> Result<(Project, RelPath), DomainError> {
    let project = state.project(id)?;
    let rel = RelPath::parse(rel)?;
    if !project.available {
        return Err(DomainError::NotFound);
    }
    Ok((project, rel))
}

#[tauri::command(async)]
pub fn list_projects(state: State<'_, Arc<AppState>>) -> Vec<ProjectInfo> {
    do_list_projects(&state)
}

#[tauri::command(async)]
pub fn add_project(
    state: State<'_, Arc<AppState>>,
    name: Option<String>,
    path: String,
) -> Result<ProjectInfo, CommandError> {
    let project = do_add_project(&state, name.as_deref(), Path::new(&path))?;
    Ok(ProjectInfo::from(&project))
}

#[tauri::command(async)]
pub fn remove_project(
    state: State<'_, Arc<AppState>>,
    project_id: i64,
) -> Result<(), CommandError> {
    do_remove_project(&state, ProjectId(project_id))
}

/// Opens an `http(s)` link in the OS browser (or `mailto:` in the mail client).
/// The WebView has no opener permission of its own; this is the only way out,
/// and it refuses other schemes.
#[tauri::command(async)]
pub fn open_external<R: Runtime>(app: AppHandle<R>, url: String) -> Result<(), CommandError> {
    use tauri_plugin_opener::OpenerExt;
    if !is_external_url(&url) {
        return Err(
            DomainError::InvalidPath("only http(s) and mailto links can be opened".into()).into(),
        );
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| DomainError::Io(format!("failed to open the link: {e}")).into())
}

#[tauri::command(async)]
pub fn list_dir(
    state: State<'_, Arc<AppState>>,
    project_id: i64,
    rel: String,
) -> Result<Vec<TreeEntryDto>, CommandError> {
    do_list_dir(&state, ProjectId(project_id), &rel)
}

#[tauri::command(async)]
pub fn read_markdown(
    state: State<'_, Arc<AppState>>,
    project_id: i64,
    rel: String,
) -> Result<String, CommandError> {
    do_read_markdown(&state, ProjectId(project_id), &rel)
}

#[tauri::command(async)]
pub fn list_inbox(state: State<'_, Arc<AppState>>) -> Result<Vec<InboxItemDto>, CommandError> {
    do_list_inbox(&state)
}

#[tauri::command(async)]
pub fn inbox_counts(state: State<'_, Arc<AppState>>) -> Result<InboxCountsDto, CommandError> {
    do_inbox_counts(&state)
}

#[tauri::command(async)]
pub fn mark_read(
    state: State<'_, Arc<AppState>>,
    project_id: i64,
    rel: String,
) -> Result<bool, CommandError> {
    do_mark_read(&state, ProjectId(project_id), &rel)
}

#[tauri::command(async)]
pub fn mark_all_read(state: State<'_, Arc<AppState>>) -> Result<usize, CommandError> {
    do_mark_all_read(&state)
}

#[tauri::command(async)]
pub fn get_notifications_enabled(state: State<'_, Arc<AppState>>) -> bool {
    state.notifications_enabled()
}

#[tauri::command(async)]
pub fn set_notifications_enabled(
    state: State<'_, Arc<AppState>>,
    enabled: bool,
) -> Result<(), CommandError> {
    do_set_notifications_enabled(&state, enabled)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infra::store::Store;
    use std::fs;
    use tempfile::TempDir;

    fn state() -> AppState {
        AppState::load(Store::open_in_memory().unwrap()).unwrap()
    }

    #[test]
    fn file_commands_require_a_known_project() {
        let state = state();
        let unknown = ProjectId(42);
        assert_eq!(
            do_list_dir(&state, unknown, "").unwrap_err().kind,
            "ProjectNotFound"
        );
        assert_eq!(
            do_read_markdown(&state, unknown, "a.md").unwrap_err().kind,
            "ProjectNotFound"
        );
    }

    #[test]
    fn add_then_list_and_read() {
        let dir = TempDir::new().unwrap();
        fs::create_dir(dir.path().join("docs")).unwrap();
        fs::write(dir.path().join("docs/a.md"), "# A").unwrap();
        let state = state();

        let p = do_add_project(&state, Some("Reports"), dir.path()).unwrap();
        assert_eq!(p.name, "Reports");
        assert!(p.available);

        let top = do_list_dir(&state, p.id, "").unwrap();
        assert_eq!(
            top,
            [TreeEntryDto {
                name: "docs".into(),
                rel_path: "docs".into(),
                kind: "dir"
            }]
        );
        assert_eq!(
            do_list_dir(&state, p.id, "docs").unwrap()[0].rel_path,
            "docs/a.md"
        );
        assert_eq!(do_read_markdown(&state, p.id, "docs/a.md").unwrap(), "# A");
    }

    #[test]
    fn add_without_a_name_uses_the_folder_name() {
        let parent = TempDir::new().unwrap();
        let folder = parent.path().join("agent-out");
        fs::create_dir(&folder).unwrap();
        let state = state();
        let p = do_add_project(&state, Some("   "), &folder).unwrap();
        assert_eq!(p.name, "agent-out");
        let p2 = {
            let other = parent.path().join("second");
            fs::create_dir(&other).unwrap();
            do_add_project(&state, None, &other).unwrap()
        };
        assert_eq!(p2.name, "second");
    }

    #[test]
    fn add_rejects_duplicate_nested_and_containing_folders() {
        let parent = TempDir::new().unwrap();
        let folder = parent.path().join("reports");
        fs::create_dir_all(folder.join("sub")).unwrap();
        let state = state();
        do_add_project(&state, None, &folder).unwrap();

        let dup = do_add_project(&state, None, &folder).unwrap_err();
        assert_eq!(dup.kind, "AlreadyRegistered");
        let nested = do_add_project(&state, None, &folder.join("sub")).unwrap_err();
        assert_eq!(nested.kind, "OverlapsProject");
        let containing = do_add_project(&state, None, parent.path()).unwrap_err();
        assert_eq!(containing.kind, "OverlapsProject");
        assert_eq!(do_list_projects(&state).len(), 1);
    }

    #[test]
    fn add_rejects_files_and_missing_folders() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("a.md");
        fs::write(&file, "x").unwrap();
        let state = state();
        assert_eq!(
            do_add_project(&state, None, &file).unwrap_err().kind,
            "NotADirectory"
        );
        assert_eq!(
            do_add_project(&state, None, &dir.path().join("missing"))
                .unwrap_err()
                .kind,
            "NotFound"
        );
    }

    #[test]
    fn projects_are_sorted_by_name_then_id() {
        let parent = TempDir::new().unwrap();
        let state = state();
        for (dir, name) in [("x", "beta"), ("y", "Alpha"), ("z", "alpha")] {
            let d = parent.path().join(dir);
            fs::create_dir(&d).unwrap();
            do_add_project(&state, Some(name), &d).unwrap();
        }
        let names: Vec<_> = do_list_projects(&state)
            .into_iter()
            .map(|p| p.name)
            .collect();
        assert_eq!(names, ["Alpha", "alpha", "beta"]);
    }

    #[test]
    fn remove_unregisters_without_touching_files() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("a.md"), "keep me").unwrap();
        let state = state();
        let p = do_add_project(&state, None, dir.path()).unwrap();

        do_remove_project(&state, p.id).unwrap();
        assert!(do_list_projects(&state).is_empty());
        assert_eq!(
            do_read_markdown(&state, p.id, "a.md").unwrap_err().kind,
            "ProjectNotFound"
        );
        assert_eq!(
            do_remove_project(&state, p.id).unwrap_err().kind,
            "ProjectNotFound"
        );
        assert_eq!(
            fs::read_to_string(dir.path().join("a.md")).unwrap(),
            "keep me"
        );
        // The folder can be registered again.
        do_add_project(&state, None, dir.path()).unwrap();
    }

    #[test]
    fn projects_survive_a_reload() {
        let dir = TempDir::new().unwrap();
        let db = TempDir::new().unwrap();
        let db_path = db.path().join("kidock.db");
        let id = {
            let state = AppState::load(Store::open(&db_path).unwrap()).unwrap();
            do_add_project(&state, Some("Keep"), dir.path()).unwrap().id
        };
        let state = AppState::load(Store::open(&db_path).unwrap()).unwrap();
        let list = do_list_projects(&state);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, id.0);
        assert_eq!(list[0].name, "Keep");
    }

    #[test]
    fn unavailable_projects_report_not_found_but_can_be_removed() {
        let dir = TempDir::new().unwrap();
        let gone = dunce::canonicalize(dir.path()).unwrap().join("gone");
        let store = Store::open_in_memory().unwrap();
        let id = store
            .insert_project("Gone", &gone.to_string_lossy())
            .unwrap();
        let state = AppState::load(store).unwrap();

        assert!(!do_list_projects(&state)[0].available);
        assert_eq!(do_list_dir(&state, id, "").unwrap_err().kind, "NotFound");
        do_remove_project(&state, id).unwrap();
    }

    #[test]
    fn traversal_and_absolute_paths_are_rejected() {
        let dir = TempDir::new().unwrap();
        let state = state();
        let p = do_add_project(&state, None, dir.path()).unwrap();
        for rel in ["../../etc/hosts", "/etc/hosts", r"\Windows\win.ini"] {
            assert_eq!(
                do_read_markdown(&state, p.id, rel).unwrap_err().kind,
                "OutsideRoot",
                "{rel}"
            );
            assert_eq!(
                do_list_dir(&state, p.id, rel).unwrap_err().kind,
                "OutsideRoot",
                "{rel}"
            );
        }
        assert_eq!(
            do_read_markdown(&state, p.id, "C:/x.md").unwrap_err().kind,
            "InvalidPath"
        );
    }

    #[test]
    fn inbox_commands_list_count_and_mark_read() {
        use crate::domain::{ChangeKind, ProjectChange};
        let parent = TempDir::new().unwrap();
        let (a, b) = (parent.path().join("a"), parent.path().join("b"));
        fs::create_dir(&a).unwrap();
        fs::create_dir(&b).unwrap();
        let state = state();
        let pa = do_add_project(&state, Some("A"), &a).unwrap();
        let pb = do_add_project(&state, Some("B"), &b).unwrap();
        let ch = |p: ProjectId, rel: &str| ProjectChange {
            project: p,
            rel: RelPath::parse(rel).unwrap(),
            kind: ChangeKind::Created,
        };
        state
            .store()
            .record_changes(&[ch(pa.id, "x.md"), ch(pa.id, "docs/y.md")], 1)
            .unwrap();
        state
            .store()
            .record_changes(&[ch(pb.id, "z.md")], 2)
            .unwrap();

        let list = do_list_inbox(&state).unwrap();
        assert_eq!(list[0].rel_path, "z.md");
        assert_eq!(list[0].project_name, "B");
        assert_eq!(do_inbox_counts(&state).unwrap().total, 3);

        assert!(do_mark_read(&state, pa.id, "docs/y.md").unwrap());
        assert!(!do_mark_read(&state, pa.id, "docs/y.md").unwrap());
        assert_eq!(
            do_mark_read(&state, pa.id, "../escape.md")
                .unwrap_err()
                .kind,
            "OutsideRoot"
        );
        let counts = do_inbox_counts(&state).unwrap();
        assert_eq!(counts.total, 2);
        assert_eq!(
            counts.by_project,
            [
                ProjectUnreadDto {
                    project_id: pa.id.0,
                    unread: 1
                },
                ProjectUnreadDto {
                    project_id: pb.id.0,
                    unread: 1
                },
            ]
        );

        assert_eq!(do_mark_all_read(&state).unwrap(), 2);
        do_remove_project(&state, pa.id).unwrap();
        assert_eq!(do_list_inbox(&state).unwrap().len(), 1);
    }

    #[test]
    fn a_project_cannot_read_another_projects_files() {
        let parent = TempDir::new().unwrap();
        let (a, b) = (parent.path().join("a"), parent.path().join("b"));
        fs::create_dir(&a).unwrap();
        fs::create_dir(&b).unwrap();
        fs::write(b.join("secret.md"), "b only").unwrap();
        let state = state();
        let pa = do_add_project(&state, None, &a).unwrap();
        do_add_project(&state, None, &b).unwrap();
        assert_eq!(
            do_read_markdown(&state, pa.id, "../b/secret.md")
                .unwrap_err()
                .kind,
            "OutsideRoot"
        );
    }
}
