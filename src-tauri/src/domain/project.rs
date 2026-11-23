use std::path::{Component, Path};

use super::{DomainError, RootFolder};

/// Maximum length of a project name, in characters.
pub const MAX_NAME_CHARS: usize = 100;

/// Identifies a registered project (the SQLite rowid).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ProjectId(pub i64);

/// A registered, watched folder.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Project {
    pub id: ProjectId,
    pub name: String,
    pub folder: RootFolder,
    /// False when the folder was missing (or not a directory) at load time.
    pub available: bool,
}

/// The display name for a new project: the trimmed `input`, or the folder's
/// name when `input` is empty. Truncated to [`MAX_NAME_CHARS`].
pub fn project_name(input: Option<&str>, folder: &RootFolder) -> String {
    let trimmed = input.map(str::trim).unwrap_or_default();
    let name = if trimmed.is_empty() {
        folder.display_name()
    } else {
        trimmed.to_owned()
    };
    name.chars().take(MAX_NAME_CHARS).collect()
}

/// Rejects `candidate` if it equals, lies inside, or contains any `existing`
/// project folder, so every file belongs to at most one project. All paths
/// must be canonical. Comparison is component-wise; with `case_insensitive`
/// (macOS/Windows file systems) components are compared lowercased.
pub fn check_overlap(
    existing: &[&Path],
    candidate: &Path,
    case_insensitive: bool,
) -> Result<(), DomainError> {
    let key = |p: &Path| -> Vec<String> {
        p.components()
            .filter(|c| !matches!(c, Component::CurDir))
            .map(|c| {
                let s = c.as_os_str().to_string_lossy();
                if case_insensitive {
                    s.to_lowercase()
                } else {
                    s.into_owned()
                }
            })
            .collect()
    };
    let cand = key(candidate);
    for path in existing {
        let other = key(path);
        if other == cand {
            return Err(DomainError::AlreadyRegistered);
        }
        if cand.starts_with(&other) || other.starts_with(&cand) {
            return Err(DomainError::OverlapsProject);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn folder(p: &str) -> RootFolder {
        RootFolder::new(PathBuf::from(p))
    }

    #[test]
    fn name_uses_trimmed_input() {
        assert_eq!(
            project_name(Some("  Reports  "), &folder("/a/x")),
            "Reports"
        );
    }

    #[test]
    fn name_falls_back_to_folder_name() {
        assert_eq!(project_name(None, &folder("/a/agent-out")), "agent-out");
        assert_eq!(project_name(Some(""), &folder("/a/agent-out")), "agent-out");
        assert_eq!(
            project_name(Some(" \t "), &folder("/a/agent-out")),
            "agent-out"
        );
    }

    #[test]
    fn name_is_truncated_at_a_char_boundary() {
        let long = "あ".repeat(150);
        let name = project_name(Some(&long), &folder("/a"));
        assert_eq!(name.chars().count(), MAX_NAME_CHARS);
        assert!(name.chars().all(|c| c == 'あ'));
    }

    #[test]
    fn overlap_rejects_the_same_folder() {
        let existing = [Path::new("/home/me/reports")];
        assert_eq!(
            check_overlap(&existing, Path::new("/home/me/reports"), false),
            Err(DomainError::AlreadyRegistered)
        );
    }

    #[test]
    fn overlap_rejects_nested_and_containing_folders() {
        let existing = [Path::new("/home/me/reports")];
        assert_eq!(
            check_overlap(&existing, Path::new("/home/me/reports/sub"), false),
            Err(DomainError::OverlapsProject)
        );
        assert_eq!(
            check_overlap(&existing, Path::new("/home/me"), false),
            Err(DomainError::OverlapsProject)
        );
    }

    #[test]
    fn overlap_allows_siblings_with_a_shared_prefix() {
        let existing = [Path::new("/home/me/reports")];
        assert_eq!(
            check_overlap(&existing, Path::new("/home/me/reports-old"), false),
            Ok(())
        );
        assert_eq!(check_overlap(&[], Path::new("/x"), false), Ok(()));
    }

    #[test]
    fn overlap_honors_case_sensitivity_mode() {
        let existing = [Path::new("/Users/Me/Reports")];
        assert_eq!(
            check_overlap(&existing, Path::new("/users/me/reports"), true),
            Err(DomainError::AlreadyRegistered)
        );
        assert_eq!(
            check_overlap(&existing, Path::new("/users/me/reports/a"), true),
            Err(DomainError::OverlapsProject)
        );
        assert_eq!(
            check_overlap(&existing, Path::new("/users/me/reports"), false),
            Ok(())
        );
    }
}
