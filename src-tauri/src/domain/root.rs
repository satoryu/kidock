use std::path::{Path, PathBuf};

use super::RelPath;

/// A registered folder. `canonical_path` must already be canonicalized by the
/// caller (infra), so that containment checks compare like with like.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RootFolder {
    pub canonical_path: PathBuf,
}

impl RootFolder {
    pub fn new(canonical_path: PathBuf) -> Self {
        Self { canonical_path }
    }

    /// The folder's own name, falling back to the full path (e.g. for `/` or `C:\`).
    pub fn display_name(&self) -> String {
        self.canonical_path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| self.canonical_path.to_string_lossy().into_owned())
    }

    /// Lexical join; the result is not yet canonicalized.
    pub fn join(&self, rel: &RelPath) -> PathBuf {
        self.canonical_path.join(rel.to_path_buf())
    }

    /// True if an already-canonicalized `path` lies within this folder
    /// (component-wise, so `/a/bc` is not inside `/a/b`).
    pub fn contains(&self, canonical: &Path) -> bool {
        canonical.starts_with(&self.canonical_path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root(p: &str) -> RootFolder {
        RootFolder::new(PathBuf::from(p))
    }

    #[test]
    fn contains_is_component_wise() {
        let r = root("/home/me/reports");
        assert!(r.contains(Path::new("/home/me/reports")));
        assert!(r.contains(Path::new("/home/me/reports/a/b.md")));
        assert!(!r.contains(Path::new("/home/me/reports-old/a.md")));
        assert!(!r.contains(Path::new("/home/me")));
    }

    #[test]
    fn join_appends_rel_path() {
        let r = root("/home/me/reports");
        let rel = RelPath::parse("a/b.md").unwrap();
        assert_eq!(r.join(&rel), Path::new("/home/me/reports/a/b.md"));
    }

    #[test]
    fn display_name_is_last_component() {
        assert_eq!(root("/home/me/reports").display_name(), "reports");
        assert_eq!(root("/").display_name(), "/");
    }
}
