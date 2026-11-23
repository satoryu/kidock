use super::filter::{ExclusionRules, is_markdown};
use super::{RelPath, sort};

/// A directory entry as read from the filesystem, before domain filtering.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawEntry {
    pub name: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntryKind {
    Dir,
    Markdown,
}

/// An entry shown in the sidebar tree.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TreeEntry {
    pub name: String,
    pub rel_path: RelPath,
    pub kind: EntryKind,
}

/// Turns one directory level of raw entries into sorted tree entries:
/// keeps directories and `.md` files, drops excluded names and names that
/// cannot be represented as a [`RelPath`] component.
pub fn build_listing(
    parent: &RelPath,
    raw: Vec<RawEntry>,
    rules: &ExclusionRules,
) -> Vec<TreeEntry> {
    let mut entries: Vec<TreeEntry> = raw
        .into_iter()
        .filter(|e| !rules.is_excluded(&e.name))
        .filter_map(|e| {
            let kind = if e.is_dir {
                EntryKind::Dir
            } else if is_markdown(&e.name) {
                EntryKind::Markdown
            } else {
                return None;
            };
            let rel_path = parent.join(&e.name).ok()?;
            Some(TreeEntry {
                name: e.name,
                rel_path,
                kind,
            })
        })
        .collect();
    sort::sort_entries(&mut entries);
    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw(name: &str, is_dir: bool) -> RawEntry {
        RawEntry {
            name: name.into(),
            is_dir,
        }
    }

    fn names(entries: &[TreeEntry]) -> Vec<&str> {
        entries.iter().map(|e| e.name.as_str()).collect()
    }

    #[test]
    fn keeps_directories_and_markdown_files_only() {
        let listing = build_listing(
            &RelPath::root(),
            vec![
                raw("a.md", false),
                raw("b.txt", false),
                raw("docs", true),
                raw("image.png", false),
            ],
            &ExclusionRules::default(),
        );
        assert_eq!(names(&listing), ["docs", "a.md"]);
        assert_eq!(listing[0].kind, EntryKind::Dir);
        assert_eq!(listing[1].kind, EntryKind::Markdown);
    }

    #[test]
    fn applies_exclusion_rules() {
        let listing = build_listing(
            &RelPath::root(),
            vec![
                raw(".git", true),
                raw("node_modules", true),
                raw(".secret.md", false),
                raw("ok.md", false),
            ],
            &ExclusionRules::default(),
        );
        assert_eq!(names(&listing), ["ok.md"]);
    }

    #[test]
    fn a_directory_named_like_markdown_is_a_directory() {
        let listing = build_listing(
            &RelPath::root(),
            vec![raw("weird.md", true)],
            &ExclusionRules::default(),
        );
        assert_eq!(listing[0].kind, EntryKind::Dir);
    }

    #[test]
    fn rel_paths_are_joined_to_the_parent() {
        let parent = RelPath::parse("notes").unwrap();
        let listing = build_listing(
            &parent,
            vec![raw("a.md", false)],
            &ExclusionRules::default(),
        );
        assert_eq!(listing[0].rel_path.to_wire(), "notes/a.md");
    }

    #[test]
    fn skips_names_that_are_not_valid_components() {
        // e.g. a macOS file literally named "a:b.md" (':' is legal there).
        let listing = build_listing(
            &RelPath::root(),
            vec![raw("a:b.md", false), raw("ok.md", false)],
            &ExclusionRules::default(),
        );
        assert_eq!(names(&listing), ["ok.md"]);
    }

    #[test]
    fn result_is_sorted() {
        let listing = build_listing(
            &RelPath::root(),
            vec![
                raw("b.md", false),
                raw("z", true),
                raw("A.md", false),
                raw("a", true),
            ],
            &ExclusionRules::default(),
        );
        assert_eq!(names(&listing), ["a", "z", "A.md", "b.md"]);
    }
}
