//! Turns "something happened around these paths" into reliable changes.
//!
//! A single worker thread processes [`Msg`]s serially, so reconciliations for
//! a project never race and SQLite is accessed sequentially. Event kinds are
//! ignored: every nominated path is re-checked against its stored state.

use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::mpsc::{Receiver, Sender, channel};
use std::thread;

use crate::domain::{
    DomainError, FileState, Project, ProjectChange, ProjectId, RelPath, StoreOp, decide,
};
use crate::infra::scan;
use crate::infra::store::FileOp;
use crate::state::AppState;

/// Work for the detector thread.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Msg {
    /// Debounced filesystem events touched these absolute paths.
    Paths {
        project: ProjectId,
        paths: Vec<PathBuf>,
    },
    /// Record the current files silently (new project).
    Baseline(ProjectId),
    /// Reconcile everything and report differences (startup, dropped events).
    Rescan(ProjectId),
}

/// Receives detected changes in batches (one batch per processed message).
pub trait ChangeSink: Send + Sync {
    fn deliver(&self, changes: &[ProjectChange]);
}

pub struct Detector {
    state: Arc<AppState>,
    sink: Arc<dyn ChangeSink>,
}

impl Detector {
    pub fn new(state: Arc<AppState>, sink: Arc<dyn ChangeSink>) -> Self {
        Self { state, sink }
    }

    /// Starts the worker thread; it runs until every sender is dropped.
    pub fn spawn(self) -> Sender<Msg> {
        let (tx, rx) = channel();
        thread::Builder::new()
            .name("kidock-detector".into())
            .spawn(move || self.run(rx))
            .expect("failed to spawn the detector thread");
        tx
    }

    fn run(self, rx: Receiver<Msg>) {
        for msg in rx {
            if let Err(e) = self.handle(&msg) {
                eprintln!("kidock: change detection failed for {msg:?}: {e}");
            }
        }
    }

    /// Processes one message and delivers the resulting changes (if any).
    pub fn handle(&self, msg: &Msg) -> Result<(), DomainError> {
        let (id, emit) = match msg {
            Msg::Paths { project, .. } | Msg::Rescan(project) => (*project, true),
            Msg::Baseline(project) => (*project, false),
        };
        // A removed (or unavailable) project: nothing to do.
        let Ok(project) = self.state.project(id) else {
            return Ok(());
        };
        if !project.available {
            return Ok(());
        }
        let known = self.state.store().file_states(id)?;

        let candidates = match msg {
            Msg::Paths { paths, .. } => self.candidates_for(&project, paths, &known),
            Msg::Baseline(_) | Msg::Rescan(_) => self.everything(&project, &known),
        };

        // Event-nominated paths are few, so always hash them: a same-size
        // rewrite within the file system's mtime resolution must not be missed.
        // Full scans touch every file and rely on size/mtime to skip unchanged ones.
        let force_hash = matches!(msg, Msg::Paths { .. });
        let rules = &self.state.rules;
        let mut ops = Vec::new();
        let mut changes = Vec::new();
        for wire in candidates {
            let Ok(rel) = RelPath::parse(&wire) else {
                continue;
            };
            let before = known.get(&wire);
            let now = scan::observe(&project.folder, &rel, rules, before.filter(|_| !force_hash));
            let decision = decide(before, now.as_ref());
            match decision.store {
                StoreOp::Upsert(st) => ops.push(FileOp::Upsert(wire.clone(), st)),
                StoreOp::Delete => ops.push(FileOp::Delete(wire.clone())),
                StoreOp::Keep => {}
            }
            if let Some(kind) = decision.change {
                changes.push(ProjectChange {
                    project: id,
                    rel,
                    kind,
                });
            }
        }

        {
            let mut store = self.state.store();
            if !ops.is_empty() {
                store.apply_file_ops(id, &ops)?;
            }
            if matches!(msg, Msg::Baseline(_)) {
                store.mark_baselined(id)?;
            }
        }
        if emit && !changes.is_empty() {
            self.sink.deliver(&changes);
        }
        Ok(())
    }

    /// Paths worth re-checking for a batch of event paths.
    fn candidates_for(
        &self,
        project: &Project,
        paths: &[PathBuf],
        known: &HashMap<String, FileState>,
    ) -> BTreeSet<String> {
        let mut out = BTreeSet::new();
        for path in paths {
            let Some(rel) = to_rel(&project.folder.canonical_path, path) else {
                continue;
            };
            if rel.is_root() {
                return self.everything(project, known);
            }
            out.insert(rel.to_wire());
            // It may have been a directory that was removed or moved away.
            let prefix = format!("{}/", rel.to_wire());
            out.extend(known.keys().filter(|k| k.starts_with(&prefix)).cloned());
            // Siblings: the debouncer rewrites queued events on rename, so a
            // rename may arrive as only its new path. Re-checking the known
            // files of the same folder catches the vanished old name.
            let parent = parent_prefix(&rel);
            out.extend(
                known
                    .keys()
                    .filter(|k| k.starts_with(&parent) && !k[parent.len()..].contains('/'))
                    .cloned(),
            );
            // Or a directory that appeared (created or moved in).
            if scan::is_dir(&project.folder, &rel) {
                out.extend(
                    scan::walk(&project.folder, &rel, &self.state.rules)
                        .into_iter()
                        .map(|(r, _)| r.to_wire()),
                );
            }
        }
        out
    }

    fn everything(
        &self,
        project: &Project,
        known: &HashMap<String, FileState>,
    ) -> BTreeSet<String> {
        let mut out: BTreeSet<String> = known.keys().cloned().collect();
        out.extend(
            scan::walk(&project.folder, &RelPath::root(), &self.state.rules)
                .into_iter()
                .map(|(r, _)| r.to_wire()),
        );
        out
    }
}

/// `"a/b/"` for `a/b/c.md`, `""` for a top-level path.
fn parent_prefix(rel: &RelPath) -> String {
    match rel.components() {
        [] | [_] => String::new(),
        [dirs @ .., _] => format!("{}/", dirs.join("/")),
    }
}

/// Maps an absolute event path to a path relative to `root`. Paths outside
/// `root` (or not representable as `RelPath`) yield `None`.
fn to_rel(root: &Path, path: &Path) -> Option<RelPath> {
    let rest = match path.strip_prefix(root) {
        Ok(rest) => rest.to_path_buf(),
        // The OS may report a non-canonical form (e.g. `/var` vs `/private/var`
        // on macOS). Canonicalize the parent, which still exists for deletions.
        Err(_) => {
            let parent = dunce::canonicalize(path.parent()?).ok()?;
            parent
                .join(path.file_name()?)
                .strip_prefix(root)
                .ok()?
                .to_path_buf()
        }
    };
    let parts: Option<Vec<&str>> = rest.components().map(|c| c.as_os_str().to_str()).collect();
    RelPath::parse(&parts?.join("/")).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::ChangeKind::{self, *};
    use crate::infra::store::Store;
    use std::fs;
    use std::sync::Mutex;
    use tempfile::TempDir;

    #[derive(Default)]
    struct Collect(Mutex<Vec<Vec<(String, ChangeKind)>>>);

    impl ChangeSink for Collect {
        fn deliver(&self, changes: &[ProjectChange]) {
            self.0
                .lock()
                .unwrap()
                .push(changes.iter().map(|c| (c.rel.to_wire(), c.kind)).collect());
        }
    }

    impl Collect {
        fn take(&self) -> Vec<Vec<(String, ChangeKind)>> {
            std::mem::take(&mut *self.0.lock().unwrap())
        }
    }

    struct Fixture {
        dir: TempDir,
        id: ProjectId,
        detector: Detector,
        sink: Arc<Collect>,
        state: Arc<AppState>,
    }

    impl Fixture {
        fn new() -> Self {
            let dir = TempDir::new().unwrap();
            let canonical = dunce::canonicalize(dir.path()).unwrap();
            let store = Store::open_in_memory().unwrap();
            let id = store
                .insert_project("p", &canonical.to_string_lossy())
                .unwrap();
            let state = Arc::new(AppState::load(store).unwrap());
            let sink = Arc::new(Collect::default());
            let detector = Detector::new(state.clone(), sink.clone());
            Self {
                dir,
                id,
                detector,
                sink,
                state,
            }
        }

        fn path(&self, rel: &str) -> PathBuf {
            dunce::canonicalize(self.dir.path()).unwrap().join(rel)
        }

        fn write(&self, rel: &str, content: &str) {
            let p = self.path(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(p, content).unwrap();
        }

        fn paths(&self, rels: &[&str]) {
            let paths = rels.iter().map(|r| self.path(r)).collect();
            self.detector
                .handle(&Msg::Paths {
                    project: self.id,
                    paths,
                })
                .unwrap();
        }

        fn known(&self) -> Vec<String> {
            let mut k: Vec<_> = self
                .state
                .store()
                .file_states(self.id)
                .unwrap()
                .into_keys()
                .collect();
            k.sort();
            k
        }
    }

    fn batch(items: &[(&str, ChangeKind)]) -> Vec<Vec<(String, ChangeKind)>> {
        vec![items.iter().map(|(r, k)| (r.to_string(), *k)).collect()]
    }

    #[test]
    fn baseline_records_silently_and_marks_the_project() {
        let f = Fixture::new();
        f.write("a.md", "a");
        f.write("docs/b.md", "b");
        f.detector.handle(&Msg::Baseline(f.id)).unwrap();
        assert!(f.sink.take().is_empty());
        assert_eq!(f.known(), ["a.md", "docs/b.md"]);
        assert!(f.state.store().is_baselined(f.id).unwrap());
    }

    #[test]
    fn create_update_and_delete_are_detected() {
        let f = Fixture::new();
        f.detector.handle(&Msg::Baseline(f.id)).unwrap();

        f.write("a.md", "one");
        f.paths(&["a.md"]);
        assert_eq!(f.sink.take(), batch(&[("a.md", Created)]));

        f.write("a.md", "two!");
        f.paths(&["a.md"]);
        assert_eq!(f.sink.take(), batch(&[("a.md", Updated)]));

        fs::remove_file(f.path("a.md")).unwrap();
        f.paths(&["a.md"]);
        assert_eq!(f.sink.take(), batch(&[("a.md", Deleted)]));
        assert!(f.known().is_empty());
    }

    #[test]
    fn identical_rewrite_is_not_reported() {
        let f = Fixture::new();
        f.write("a.md", "same");
        f.detector.handle(&Msg::Baseline(f.id)).unwrap();
        f.write("a.md", "same");
        f.paths(&["a.md"]);
        assert!(f.sink.take().is_empty());
    }

    #[test]
    fn atomic_save_is_one_update_and_the_temp_file_is_ignored() {
        let f = Fixture::new();
        f.write("report.md", "v1");
        f.detector.handle(&Msg::Baseline(f.id)).unwrap();

        f.write("report.md.tmp", "v2");
        fs::rename(f.path("report.md.tmp"), f.path("report.md")).unwrap();
        // Whatever the OS reports (create/rename/modify), the paths are the same.
        f.paths(&["report.md.tmp", "report.md", "report.md"]);
        assert_eq!(f.sink.take(), batch(&[("report.md", Updated)]));
        assert_eq!(f.known(), ["report.md"]);
    }

    #[test]
    fn same_size_rewrite_with_unchanged_mtime_is_still_detected() {
        let f = Fixture::new();
        f.write("a.md", "v1");
        f.detector.handle(&Msg::Baseline(f.id)).unwrap();
        let mtime = fs::metadata(f.path("a.md")).unwrap().modified().unwrap();

        f.write("a.md", "v2");
        // Simulate a coarse mtime resolution: the rewrite keeps the old mtime.
        fs::File::options()
            .write(true)
            .open(f.path("a.md"))
            .unwrap()
            .set_modified(mtime)
            .unwrap();
        f.paths(&["a.md"]);
        assert_eq!(f.sink.take(), batch(&[("a.md", Updated)]));
    }

    #[test]
    fn rename_is_delete_plus_create() {
        let f = Fixture::new();
        f.write("old.md", "x");
        f.detector.handle(&Msg::Baseline(f.id)).unwrap();
        fs::rename(f.path("old.md"), f.path("new.md")).unwrap();
        f.paths(&["old.md", "new.md"]);
        assert_eq!(
            f.sink.take(),
            batch(&[("new.md", Created), ("old.md", Deleted)])
        );
    }

    #[test]
    fn a_rename_reported_only_by_its_new_path_still_deletes_the_old_one() {
        // The debouncer rewrites queued events on rename, so the old path
        // can be missing from the batch entirely.
        let f = Fixture::new();
        f.write("docs/old.md", "x");
        f.write("docs/other.md", "y");
        f.detector.handle(&Msg::Baseline(f.id)).unwrap();
        fs::rename(f.path("docs/old.md"), f.path("docs/renamed.md")).unwrap();
        f.paths(&["docs/renamed.md"]);
        assert_eq!(
            f.sink.take(),
            batch(&[("docs/old.md", Deleted), ("docs/renamed.md", Created)])
        );
    }

    #[test]
    fn excluded_and_non_markdown_paths_are_ignored() {
        let f = Fixture::new();
        f.detector.handle(&Msg::Baseline(f.id)).unwrap();
        for rel in [
            ".git/HEAD.md",
            "node_modules/x/readme.md",
            ".hidden.md",
            "notes.txt",
            "a.md~",
        ] {
            f.write(rel, "x");
        }
        f.paths(&[
            ".git/HEAD.md",
            "node_modules/x/readme.md",
            ".hidden.md",
            "notes.txt",
            "a.md~",
        ]);
        assert!(f.sink.take().is_empty());
        assert!(f.known().is_empty());
    }

    #[test]
    fn a_directory_moved_in_or_removed_is_reconciled_recursively() {
        let f = Fixture::new();
        f.detector.handle(&Msg::Baseline(f.id)).unwrap();

        // A whole directory appears with a single event for the directory.
        f.write("batch/a.md", "a");
        f.write("batch/sub/b.md", "b");
        f.paths(&["batch"]);
        assert_eq!(
            f.sink.take(),
            batch(&[("batch/a.md", Created), ("batch/sub/b.md", Created)])
        );

        // And disappears again, also with one event.
        fs::remove_dir_all(f.path("batch")).unwrap();
        f.paths(&["batch"]);
        assert_eq!(
            f.sink.take(),
            batch(&[("batch/a.md", Deleted), ("batch/sub/b.md", Deleted)])
        );
    }

    #[test]
    fn rescan_reports_offline_changes() {
        let f = Fixture::new();
        f.write("kept.md", "same");
        f.write("changed.md", "v1");
        f.write("gone.md", "x");
        f.detector.handle(&Msg::Baseline(f.id)).unwrap();

        f.write("changed.md", "v2 (while closed)");
        fs::remove_file(f.path("gone.md")).unwrap();
        f.write("new.md", "n");
        f.detector.handle(&Msg::Rescan(f.id)).unwrap();
        assert_eq!(
            f.sink.take(),
            batch(&[
                ("changed.md", Updated),
                ("gone.md", Deleted),
                ("new.md", Created)
            ])
        );
    }

    /// The production recording path (minus the Tauri event).
    struct InboxSink(Arc<AppState>);

    impl ChangeSink for InboxSink {
        fn deliver(&self, changes: &[ProjectChange]) {
            crate::infra::sink::record_in_inbox(&self.0, changes);
        }
    }

    #[test]
    fn detected_changes_land_in_the_inbox_but_the_baseline_does_not() {
        let f = Fixture::new();
        f.write("existing.md", "x");
        let detector = Detector::new(f.state.clone(), Arc::new(InboxSink(f.state.clone())));
        detector.handle(&Msg::Baseline(f.id)).unwrap();
        assert!(f.state.store().list_inbox(10).unwrap().is_empty());

        f.write("new.md", "n");
        detector
            .handle(&Msg::Paths {
                project: f.id,
                paths: vec![f.path("new.md")],
            })
            .unwrap();
        let items = f.state.store().list_inbox(10).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].rel_path, "new.md");
        assert!(!items[0].read);
    }

    #[test]
    fn paths_outside_the_project_and_removed_projects_are_ignored() {
        let f = Fixture::new();
        f.detector.handle(&Msg::Baseline(f.id)).unwrap();
        let outside = TempDir::new().unwrap();
        fs::write(outside.path().join("x.md"), "x").unwrap();
        f.detector
            .handle(&Msg::Paths {
                project: f.id,
                paths: vec![outside.path().join("x.md")],
            })
            .unwrap();
        assert!(f.sink.take().is_empty());

        f.detector.handle(&Msg::Rescan(ProjectId(999))).unwrap();
        assert!(f.sink.take().is_empty());
    }

    #[test]
    fn parent_prefix_of_nested_and_top_level_paths() {
        assert_eq!(parent_prefix(&RelPath::parse("a/b/c.md").unwrap()), "a/b/");
        assert_eq!(parent_prefix(&RelPath::parse("c.md").unwrap()), "");
    }

    #[test]
    fn to_rel_maps_paths_under_the_root() {
        let root = Path::new("/r/proj");
        assert_eq!(
            to_rel(root, Path::new("/r/proj/a/b.md")).map(|r| r.to_wire()),
            Some("a/b.md".into())
        );
        assert_eq!(
            to_rel(root, Path::new("/r/proj")).map(|r| r.is_root()),
            Some(true)
        );
        assert_eq!(to_rel(root, Path::new("/r/other/a.md")), None);
    }
}
