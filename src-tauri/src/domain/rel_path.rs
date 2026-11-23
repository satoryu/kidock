use std::path::PathBuf;

use super::DomainError;

/// A validated path relative to a registered folder.
///
/// On the wire it is always `/`-separated; `""` denotes the folder itself.
/// Construction rejects anything that could escape the folder or be
/// interpreted as an absolute path on any supported OS.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default)]
pub struct RelPath {
    components: Vec<String>,
}

impl RelPath {
    /// The registered folder itself.
    pub fn root() -> Self {
        Self::default()
    }

    /// Parses a relative path. Both `/` and `\` are accepted as separators so
    /// that the same rules apply on every OS.
    pub fn parse(s: &str) -> Result<Self, DomainError> {
        if s.is_empty() {
            return Ok(Self::root());
        }
        if s.starts_with(['/', '\\']) {
            return Err(DomainError::OutsideRoot);
        }
        let components = s
            .split(['/', '\\'])
            .map(|seg| validate_component(seg).map(str::to_owned))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self { components })
    }

    /// Appends a single path component (e.g. a directory entry name).
    pub fn join(&self, name: &str) -> Result<Self, DomainError> {
        if name.contains(['/', '\\']) {
            return Err(DomainError::InvalidPath(
                "name must not contain a path separator".into(),
            ));
        }
        validate_component(name)?;
        let mut components = self.components.clone();
        components.push(name.to_owned());
        Ok(Self { components })
    }

    pub fn is_root(&self) -> bool {
        self.components.is_empty()
    }

    /// Last component, if any.
    pub fn file_name(&self) -> Option<&str> {
        self.components.last().map(String::as_str)
    }

    /// `/`-separated form used across IPC.
    pub fn to_wire(&self) -> String {
        self.components.join("/")
    }

    /// Platform-native relative path.
    pub fn to_path_buf(&self) -> PathBuf {
        self.components.iter().collect()
    }
}

fn validate_component(seg: &str) -> Result<&str, DomainError> {
    match seg {
        ".." => Err(DomainError::OutsideRoot),
        "" => Err(DomainError::InvalidPath("empty path segment".into())),
        "." => Err(DomainError::InvalidPath("'.' segment".into())),
        // ':' covers Windows drive letters (`C:`) and NTFS alternate data streams.
        s if s.contains([':', '\0']) => Err(DomainError::InvalidPath(format!(
            "forbidden character in segment {s:?}"
        ))),
        s => Ok(s),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_string_is_root() {
        let p = RelPath::parse("").unwrap();
        assert!(p.is_root());
        assert_eq!(p.to_wire(), "");
    }

    #[test]
    fn parses_nested_path_and_round_trips() {
        let p = RelPath::parse("notes/2026/report.md").unwrap();
        assert_eq!(p.to_wire(), "notes/2026/report.md");
        assert_eq!(p.file_name(), Some("report.md"));
        assert_eq!(
            p.to_path_buf(),
            ["notes", "2026", "report.md"].iter().collect::<PathBuf>()
        );
    }

    #[test]
    fn accepts_backslash_separators_and_normalizes_to_slash() {
        let p = RelPath::parse(r"notes\report.md").unwrap();
        assert_eq!(p.to_wire(), "notes/report.md");
    }

    #[test]
    fn accepts_spaces_and_non_ascii_names() {
        let p = RelPath::parse("議事録/my report.md").unwrap();
        assert_eq!(p.to_wire(), "議事録/my report.md");
    }

    #[test]
    fn rejects_parent_dir_components_as_outside_root() {
        for s in ["..", "../etc/hosts", "a/../../b", r"a\..\..\b"] {
            assert_eq!(RelPath::parse(s), Err(DomainError::OutsideRoot), "{s}");
        }
    }

    #[test]
    fn rejects_absolute_paths_as_outside_root() {
        for s in ["/etc/hosts", r"\Windows\System32", r"\\server\share\a.md"] {
            assert_eq!(RelPath::parse(s), Err(DomainError::OutsideRoot), "{s}");
        }
    }

    #[test]
    fn rejects_drive_letters_and_colons() {
        for s in [r"C:\Windows", "C:", "a/b:stream.md"] {
            assert!(
                matches!(RelPath::parse(s), Err(DomainError::InvalidPath(_))),
                "{s}"
            );
        }
    }

    #[test]
    fn rejects_empty_and_dot_segments_and_nul() {
        for s in ["a//b", "a/", "./a", "a/./b", "a\0b"] {
            assert!(
                matches!(RelPath::parse(s), Err(DomainError::InvalidPath(_))),
                "{s:?}"
            );
        }
    }

    #[test]
    fn join_appends_a_single_component() {
        let p = RelPath::parse("notes").unwrap().join("a.md").unwrap();
        assert_eq!(p.to_wire(), "notes/a.md");
        assert_eq!(RelPath::root().join("a.md").unwrap().to_wire(), "a.md");
    }

    #[test]
    fn join_rejects_names_with_separators_or_parent_refs() {
        let base = RelPath::root();
        assert_eq!(base.join(".."), Err(DomainError::OutsideRoot));
        assert!(base.join("a/b").is_err());
        assert!(base.join(r"a\b").is_err());
        assert!(base.join("").is_err());
    }
}
