//! Reading the current state of tracked files from disk.

use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::domain::hash::fnv1a64;
use crate::domain::{ExclusionRules, FileState, RelPath, RootFolder, is_tracked, needs_hash};

/// Size and mtime of a file, before deciding whether to hash it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Stat {
    pub size: u64,
    pub mtime_ns: i64,
}

/// Recursively lists tracked Markdown files under `start` (a path inside
/// `root`). Excluded entries are pruned, directory symlinks are not followed
/// (no loops, no escapes), and names that are not UTF-8 are skipped.
pub fn walk(root: &RootFolder, start: &RelPath, rules: &ExclusionRules) -> Vec<(RelPath, Stat)> {
    let mut out = Vec::new();
    let mut stack = vec![start.clone()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(root.join(&dir)) else {
            continue;
        };
        for entry in entries.filter_map(Result::ok) {
            let Ok(name) = entry.file_name().into_string() else {
                continue;
            };
            if rules.is_excluded(&name) {
                continue;
            }
            let Ok(rel) = dir.join(&name) else { continue };
            // `file_type` does not follow symlinks.
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_dir() {
                stack.push(rel);
            } else if is_tracked(&rel, rules)
                && let Some(stat) = stat_file(&entry.path())
            {
                out.push((rel, stat));
            }
        }
    }
    out
}

/// The current state of `rel`, or `None` if it is absent, not a regular file
/// (after following a symlink), not tracked, or unreadable. Hashes the content
/// only when size or mtime differ from `known`.
pub fn observe(
    root: &RootFolder,
    rel: &RelPath,
    rules: &ExclusionRules,
    known: Option<&FileState>,
) -> Option<FileState> {
    if !is_tracked(rel, rules) {
        return None;
    }
    let path = root.join(rel);
    let stat = stat_file(&path)?;
    if let Some(k) = known.filter(|_| !needs_hash(known, stat.size, stat.mtime_ns)) {
        return Some(*k);
    }
    // The file may change between stat and read; the next event re-checks it.
    let bytes = fs::read(&path).ok()?;
    Some(FileState {
        size: bytes.len() as u64,
        mtime_ns: stat.mtime_ns,
        hash: fnv1a64(&bytes),
    })
}

/// Whether `rel` currently is a directory (symlinks not followed).
pub fn is_dir(root: &RootFolder, rel: &RelPath) -> bool {
    fs::symlink_metadata(root.join(rel)).is_ok_and(|m| m.is_dir())
}

fn stat_file(path: &Path) -> Option<Stat> {
    let meta = fs::metadata(path).ok()?;
    if !meta.is_file() {
        return None;
    }
    Some(Stat {
        size: meta.len(),
        mtime_ns: meta.modified().ok().map_or(0, to_nanos),
    })
}

fn to_nanos(t: SystemTime) -> i64 {
    match t.duration_since(UNIX_EPOCH) {
        Ok(d) => d.as_nanos() as i64,
        Err(e) => -(e.duration().as_nanos() as i64),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infra::fs_reader::open_root;
    use tempfile::TempDir;

    fn setup() -> (TempDir, RootFolder) {
        let dir = TempDir::new().unwrap();
        let root = open_root(dir.path()).unwrap();
        (dir, root)
    }

    fn write(root: &RootFolder, rel: &str, content: &str) {
        let path = root.join(&RelPath::parse(rel).unwrap());
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    #[test]
    fn walk_finds_tracked_files_recursively_and_prunes_exclusions() {
        let (_d, root) = setup();
        for rel in [
            "a.md",
            "docs/b.md",
            "docs/deep/c.MD",
            "docs/notes.txt",
            ".git/x.md",
            "node_modules/p/readme.md",
            ".hidden/y.md",
            "docs/.z.md",
            "docs/b.md.tmp",
        ] {
            write(&root, rel, "x");
        }
        let mut found: Vec<String> = walk(&root, &RelPath::root(), &ExclusionRules::default())
            .into_iter()
            .map(|(r, _)| r.to_wire())
            .collect();
        found.sort();
        assert_eq!(found, ["a.md", "docs/b.md", "docs/deep/c.MD"]);
    }

    #[test]
    fn walk_can_start_below_the_root() {
        let (_d, root) = setup();
        write(&root, "a.md", "x");
        write(&root, "docs/b.md", "x");
        let found = walk(
            &root,
            &RelPath::parse("docs").unwrap(),
            &ExclusionRules::default(),
        );
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].0.to_wire(), "docs/b.md");
    }

    #[cfg(unix)]
    #[test]
    fn walk_does_not_follow_directory_symlinks() {
        let (_d, root) = setup();
        let outside = TempDir::new().unwrap();
        fs::write(outside.path().join("secret.md"), "x").unwrap();
        std::os::unix::fs::symlink(outside.path(), root.canonical_path.join("link")).unwrap();
        assert!(walk(&root, &RelPath::root(), &ExclusionRules::default()).is_empty());
    }

    #[test]
    fn observe_hashes_content_and_reuses_a_matching_known_state() {
        let (_d, root) = setup();
        write(&root, "a.md", "hello");
        let rel = RelPath::parse("a.md").unwrap();
        let rules = ExclusionRules::default();
        let first = observe(&root, &rel, &rules, None).unwrap();
        assert_eq!(first.size, 5);
        assert_eq!(first.hash, fnv1a64(b"hello"));

        // Same size and mtime: the known hash is trusted (no read).
        let fake = FileState { hash: 7, ..first };
        assert_eq!(observe(&root, &rel, &rules, Some(&fake)), Some(fake));
    }

    #[test]
    fn observe_is_none_for_missing_untracked_or_directories() {
        let (_d, root) = setup();
        write(&root, "notes.txt", "x");
        fs::create_dir(root.canonical_path.join("dir.md")).unwrap();
        let rules = ExclusionRules::default();
        let o = |s: &str| observe(&root, &RelPath::parse(s).unwrap(), &rules, None);
        assert_eq!(o("missing.md"), None);
        assert_eq!(o("notes.txt"), None);
        assert_eq!(o("dir.md"), None);
    }
}
