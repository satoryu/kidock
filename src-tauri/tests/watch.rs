//! Real filesystem watching (FSEvents on macOS, ReadDirectoryChangesW on
//! Windows, inotify on Linux): the watcher + detector pipeline must report
//! each real change exactly once. No Tauri runtime is involved, so this also
//! runs on Windows CI.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, Sender, channel};
use std::sync::{Arc, Mutex};
use std::thread::sleep;
use std::time::{Duration, Instant};

use kidock_lib::domain::{ChangeKind, ProjectChange, ProjectId};
use kidock_lib::infra::detector::{ChangeSink, Detector, Msg};
use kidock_lib::infra::store::Store;
use kidock_lib::infra::watcher::Watchers;
use kidock_lib::state::AppState;
use tempfile::TempDir;

type Change = (String, ChangeKind);

struct ChannelSink(Mutex<Sender<Vec<Change>>>);

impl ChangeSink for ChannelSink {
    fn deliver(&self, changes: &[ProjectChange]) {
        let batch = changes.iter().map(|c| (c.rel.to_wire(), c.kind)).collect();
        let _ = self.0.lock().unwrap().send(batch);
    }
}

struct Harness {
    _dir: TempDir,
    root: PathBuf,
    rx: Receiver<Vec<Change>>,
    _watchers: Watchers,
}

impl Harness {
    /// Registers a project over `setup`'s files, baselines it, and starts watching.
    fn new(setup: impl FnOnce(&Path)) -> Self {
        let dir = TempDir::new().unwrap();
        let root = dunce::canonicalize(dir.path()).unwrap();
        setup(&root);
        let store = Store::open_in_memory().unwrap();
        let id: ProjectId = store.insert_project("p", &root.to_string_lossy()).unwrap();
        let state = Arc::new(AppState::load(store).unwrap());
        let (tx, rx) = channel();
        let detector_tx = Detector::new(state, Arc::new(ChannelSink(Mutex::new(tx)))).spawn();
        let mut watchers = Watchers::new(detector_tx, Duration::from_millis(300));
        watchers.send(Msg::Baseline(id));
        watchers.start(id, &root).unwrap();
        // Let the OS watcher settle before acting (FSEvents has some latency).
        sleep(Duration::from_millis(700));
        let h = Self {
            _dir: dir,
            root,
            rx,
            _watchers: watchers,
        };
        h.drain();
        h
    }

    fn path(&self, rel: &str) -> PathBuf {
        self.root.join(rel)
    }

    fn write(&self, rel: &str, content: &str) {
        let p = self.path(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, content).unwrap();
    }

    /// Discards anything pending (e.g. late events from the setup phase).
    fn drain(&self) {
        let _ = self.collect(Duration::from_millis(800), Duration::from_secs(3));
    }

    /// All changes until nothing arrives for `quiet` (or `max` elapses), sorted.
    fn collect(&self, quiet: Duration, max: Duration) -> Vec<Change> {
        let deadline = Instant::now() + max;
        let mut all = Vec::new();
        while let Some(left) = deadline.checked_duration_since(Instant::now()) {
            match self.rx.recv_timeout(quiet.min(left)) {
                Ok(batch) => all.extend(batch),
                Err(_) => break,
            }
        }
        all.sort_by(|a, b| a.0.cmp(&b.0));
        all
    }

    fn changes(&self) -> Vec<Change> {
        self.collect(Duration::from_millis(2500), Duration::from_secs(15))
    }
}

fn c(rel: &str, kind: ChangeKind) -> Change {
    (rel.to_string(), kind)
}

#[test]
fn create_then_update_in_place() {
    let h = Harness::new(|_| {});
    h.write("new.md", "# New");
    assert_eq!(h.changes(), [c("new.md", ChangeKind::Created)]);
    h.write("new.md", "# New, edited");
    assert_eq!(h.changes(), [c("new.md", ChangeKind::Updated)]);
}

#[test]
fn atomic_save_is_reported_exactly_once() {
    let h = Harness::new(|root| fs::write(root.join("report.md"), "v1").unwrap());
    h.write("report.md.tmp", "v2 written atomically");
    fs::rename(h.path("report.md.tmp"), h.path("report.md")).unwrap();
    assert_eq!(h.changes(), [c("report.md", ChangeKind::Updated)]);
}

#[test]
fn identical_rewrite_is_not_reported() {
    let h = Harness::new(|root| fs::write(root.join("same.md"), "same").unwrap());
    h.write("same.md", "same");
    assert_eq!(h.changes(), []);
}

#[test]
fn rename_and_delete() {
    let h = Harness::new(|root| fs::write(root.join("old.md"), "x").unwrap());
    fs::rename(h.path("old.md"), h.path("renamed.md")).unwrap();
    assert_eq!(
        h.changes(),
        [
            c("old.md", ChangeKind::Deleted),
            c("renamed.md", ChangeKind::Created)
        ]
    );
    fs::remove_file(h.path("renamed.md")).unwrap();
    assert_eq!(h.changes(), [c("renamed.md", ChangeKind::Deleted)]);
}

#[test]
fn excluded_and_temp_paths_are_ignored() {
    let h = Harness::new(|_| {});
    for rel in [
        ".git/objects/x.md",
        "node_modules/pkg/readme.md",
        ".hidden/a.md",
        ".dot.md",
        "notes.txt",
        "draft.md~",
        "draft.md.swp",
    ] {
        h.write(rel, "x");
    }
    assert_eq!(h.changes(), []);
}

#[test]
fn a_directory_moved_in_is_picked_up() {
    let outside = TempDir::new().unwrap();
    fs::create_dir_all(outside.path().join("batch/sub")).unwrap();
    fs::write(outside.path().join("batch/a.md"), "a").unwrap();
    fs::write(outside.path().join("batch/sub/b.md"), "b").unwrap();
    let h = Harness::new(|_| {});
    // A rename within one volume: the temp dirs share the same parent.
    fs::rename(outside.path().join("batch"), h.path("batch")).unwrap();
    assert_eq!(
        h.changes(),
        [
            c("batch/a.md", ChangeKind::Created),
            c("batch/sub/b.md", ChangeKind::Created)
        ]
    );
}
