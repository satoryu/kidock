use super::{EntryKind, TreeEntry};

/// Directories first, then files; each group ordered by name, case-insensitively
/// (ties broken by the exact name so the order is deterministic).
pub fn sort_entries(entries: &mut [TreeEntry]) {
    entries.sort_by_cached_key(|e| {
        let group = match e.kind {
            EntryKind::Dir => 0u8,
            EntryKind::Markdown => 1,
        };
        (group, e.name.to_lowercase(), e.name.clone())
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::RelPath;

    fn entry(name: &str, kind: EntryKind) -> TreeEntry {
        TreeEntry {
            name: name.into(),
            rel_path: RelPath::root().join(name).unwrap(),
            kind,
        }
    }

    #[test]
    fn directories_come_before_files() {
        let mut v = vec![
            entry("a.md", EntryKind::Markdown),
            entry("z", EntryKind::Dir),
        ];
        sort_entries(&mut v);
        assert_eq!(v[0].name, "z");
    }

    #[test]
    fn names_are_ordered_case_insensitively_and_deterministically() {
        let mut v = vec![
            entry("b.md", EntryKind::Markdown),
            entry("a.md", EntryKind::Markdown),
            entry("B.md", EntryKind::Markdown),
            entry("A.md", EntryKind::Markdown),
        ];
        sort_entries(&mut v);
        let names: Vec<_> = v.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["A.md", "a.md", "B.md", "b.md"]);
    }
}
