use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::domain::entry::build_listing;
use crate::domain::filter::is_markdown;
use crate::domain::{DomainError, ExclusionRules, RawEntry, RelPath, RootFolder, TreeEntry};

/// Canonicalizes `path` and checks that it is a directory.
pub fn open_root(path: &Path) -> Result<RootFolder, DomainError> {
    // `dunce` avoids Windows `\\?\` verbatim paths where possible, so the
    // canonical form is also what we show and hand to the asset scope.
    let canonical = dunce::canonicalize(path).map_err(map_io)?;
    if !fs::metadata(&canonical).map_err(map_io)?.is_dir() {
        return Err(DomainError::NotADirectory);
    }
    Ok(RootFolder::new(canonical))
}

/// Resolves `rel` to a canonical path that is guaranteed to be inside `root`
/// (symlinks are followed before the check).
pub fn resolve(root: &RootFolder, rel: &RelPath) -> Result<PathBuf, DomainError> {
    let canonical = dunce::canonicalize(root.join(rel)).map_err(map_io)?;
    if root.contains(&canonical) {
        Ok(canonical)
    } else {
        Err(DomainError::OutsideRoot)
    }
}

/// Lists one directory level, filtered and sorted by domain rules.
pub fn list_dir(
    root: &RootFolder,
    rel: &RelPath,
    rules: &ExclusionRules,
) -> Result<Vec<TreeEntry>, DomainError> {
    let dir = resolve(root, rel)?;
    if !fs::metadata(&dir).map_err(map_io)?.is_dir() {
        return Err(DomainError::NotADirectory);
    }
    let raw = fs::read_dir(&dir)
        .map_err(map_io)?
        // Entries that vanish or cannot be inspected mid-listing are skipped
        // rather than failing the whole directory.
        .filter_map(Result::ok)
        .filter_map(|entry| {
            // Non-UTF-8 names cannot cross IPC as `RelPath`; skip them.
            let name = entry.file_name().into_string().ok()?;
            // Follow symlinks so a linked directory shows as a directory;
            // broken links are skipped. Escapes are caught later by `resolve`.
            let is_dir = fs::metadata(entry.path()).ok()?.is_dir();
            Some(RawEntry { name, is_dir })
        })
        .collect();
    Ok(build_listing(rel, raw, rules))
}

/// Reads a `.md` file inside `root` as UTF-8.
pub fn read_markdown(root: &RootFolder, rel: &RelPath) -> Result<String, DomainError> {
    if !rel.file_name().is_some_and(is_markdown) {
        return Err(DomainError::NotMarkdown);
    }
    let path = resolve(root, rel)?;
    // Re-check after resolving: a `.md` symlink may point at a non-Markdown file.
    let target_is_md = path
        .file_name()
        .and_then(|n| n.to_str())
        .is_some_and(is_markdown);
    if !target_is_md || !fs::metadata(&path).map_err(map_io)?.is_file() {
        return Err(DomainError::NotMarkdown);
    }
    let bytes = fs::read(&path).map_err(map_io)?;
    String::from_utf8(bytes).map_err(|_| DomainError::NotUtf8)
}

fn map_io(err: io::Error) -> DomainError {
    match err.kind() {
        io::ErrorKind::NotFound => DomainError::NotFound,
        io::ErrorKind::PermissionDenied => DomainError::PermissionDenied,
        io::ErrorKind::NotADirectory => DomainError::NotADirectory,
        _ => DomainError::Io(err.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup() -> (TempDir, RootFolder) {
        let dir = TempDir::new().unwrap();
        let root = open_root(dir.path()).unwrap();
        (dir, root)
    }

    fn rel(s: &str) -> RelPath {
        RelPath::parse(s).unwrap()
    }

    #[test]
    fn open_root_canonicalizes_a_directory() {
        let dir = TempDir::new().unwrap();
        let root = open_root(dir.path()).unwrap();
        assert_eq!(
            root.canonical_path,
            dunce::canonicalize(dir.path()).unwrap()
        );
    }

    #[test]
    fn open_root_rejects_files_and_missing_paths() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("a.md");
        fs::write(&file, "x").unwrap();
        assert_eq!(open_root(&file), Err(DomainError::NotADirectory));
        assert_eq!(
            open_root(&dir.path().join("missing")),
            Err(DomainError::NotFound)
        );
    }

    #[test]
    fn resolve_returns_canonical_path_inside_root() {
        let (dir, root) = setup();
        fs::create_dir(dir.path().join("notes")).unwrap();
        fs::write(dir.path().join("notes/a.md"), "x").unwrap();
        let p = resolve(&root, &rel("notes/a.md")).unwrap();
        assert!(root.contains(&p));
        assert!(p.ends_with("notes/a.md"));
    }

    #[test]
    fn resolve_reports_missing_files() {
        let (_dir, root) = setup();
        assert_eq!(resolve(&root, &rel("nope.md")), Err(DomainError::NotFound));
    }

    #[cfg(unix)]
    #[test]
    fn resolve_rejects_symlinks_escaping_the_root() {
        let outside = TempDir::new().unwrap();
        fs::write(outside.path().join("secret.md"), "s").unwrap();
        let (dir, root) = setup();
        std::os::unix::fs::symlink(outside.path(), dir.path().join("link")).unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("secret.md"),
            dir.path().join("secret.md"),
        )
        .unwrap();
        assert_eq!(resolve(&root, &rel("link")), Err(DomainError::OutsideRoot));
        assert_eq!(
            resolve(&root, &rel("link/secret.md")),
            Err(DomainError::OutsideRoot)
        );
        assert_eq!(
            read_markdown(&root, &rel("secret.md")),
            Err(DomainError::OutsideRoot)
        );
    }

    #[cfg(unix)]
    #[test]
    fn resolve_allows_symlinks_that_stay_inside_the_root() {
        let (dir, root) = setup();
        fs::create_dir(dir.path().join("real")).unwrap();
        fs::write(dir.path().join("real/a.md"), "# a").unwrap();
        std::os::unix::fs::symlink(dir.path().join("real"), dir.path().join("alias")).unwrap();
        assert_eq!(read_markdown(&root, &rel("alias/a.md")).unwrap(), "# a");
    }

    #[test]
    fn list_dir_returns_filtered_sorted_entries() {
        let (dir, root) = setup();
        for d in ["docs", ".git", "node_modules"] {
            fs::create_dir(dir.path().join(d)).unwrap();
        }
        for f in ["b.md", "A.md", "c.txt", ".hidden.md"] {
            fs::write(dir.path().join(f), "x").unwrap();
        }
        let listing = list_dir(&root, &RelPath::root(), &ExclusionRules::default()).unwrap();
        let names: Vec<_> = listing.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["docs", "A.md", "b.md"]);
    }

    #[test]
    fn list_dir_of_subdirectory_uses_nested_rel_paths() {
        let (dir, root) = setup();
        fs::create_dir_all(dir.path().join("docs/sub")).unwrap();
        fs::write(dir.path().join("docs/a.md"), "x").unwrap();
        let listing = list_dir(&root, &rel("docs"), &ExclusionRules::default()).unwrap();
        let paths: Vec<_> = listing.iter().map(|e| e.rel_path.to_wire()).collect();
        assert_eq!(paths, ["docs/sub", "docs/a.md"]);
    }

    #[test]
    fn list_dir_handles_a_thousand_files() {
        let (dir, root) = setup();
        fs::create_dir(dir.path().join("many")).unwrap();
        for i in 0..1000 {
            fs::write(dir.path().join(format!("many/{i:04}.md")), "x").unwrap();
        }
        let listing = list_dir(&root, &rel("many"), &ExclusionRules::default()).unwrap();
        assert_eq!(listing.len(), 1000);
        assert_eq!(listing[0].name, "0000.md");
    }

    #[test]
    fn list_dir_on_a_file_is_not_a_directory() {
        let (dir, root) = setup();
        fs::write(dir.path().join("a.md"), "x").unwrap();
        assert_eq!(
            list_dir(&root, &rel("a.md"), &ExclusionRules::default()),
            Err(DomainError::NotADirectory)
        );
    }

    #[test]
    fn read_markdown_reads_utf8() {
        let (dir, root) = setup();
        fs::write(dir.path().join("a.md"), "# 見出し").unwrap();
        assert_eq!(read_markdown(&root, &rel("a.md")).unwrap(), "# 見出し");
    }

    #[test]
    fn read_markdown_rejects_non_markdown_and_invalid_utf8() {
        let (dir, root) = setup();
        fs::write(dir.path().join("a.txt"), "x").unwrap();
        fs::write(dir.path().join("bad.md"), [0xff, 0xfe, 0x00]).unwrap();
        fs::create_dir(dir.path().join("dir.md")).unwrap();
        assert_eq!(
            read_markdown(&root, &rel("a.txt")),
            Err(DomainError::NotMarkdown)
        );
        assert_eq!(
            read_markdown(&root, &rel("bad.md")),
            Err(DomainError::NotUtf8)
        );
        assert_eq!(
            read_markdown(&root, &rel("dir.md")),
            Err(DomainError::NotMarkdown)
        );
        assert_eq!(
            read_markdown(&root, &rel("gone.md")),
            Err(DomainError::NotFound)
        );
    }
}
