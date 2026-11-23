use super::RelPath;

/// Name suffixes of temp/backup files that editors and agents write before an
/// atomic rename (compared ASCII case-insensitively).
const TEMP_SUFFIXES: &[&str] = &["~", ".tmp", ".temp", ".swp", ".swo", ".part", ".crdownload"];

/// Which directory entries are hidden from the tree and ignored by the watcher.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExclusionRules {
    /// Entry names excluded anywhere in the tree (compared ASCII case-insensitively,
    /// since macOS and Windows filesystems are case-insensitive by default).
    pub names: Vec<String>,
    /// Exclude entries whose name starts with `.`.
    pub exclude_hidden: bool,
}

impl Default for ExclusionRules {
    fn default() -> Self {
        Self {
            names: vec![".git".into(), "node_modules".into()],
            exclude_hidden: true,
        }
    }
}

impl ExclusionRules {
    pub fn is_excluded(&self, name: &str) -> bool {
        (self.exclude_hidden && name.starts_with('.'))
            || self.names.iter().any(|n| n.eq_ignore_ascii_case(name))
            || is_temp_name(name)
    }
}

fn is_temp_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    TEMP_SUFFIXES.iter().any(|s| lower.ends_with(s))
}

/// True if `rel` is a Markdown file that Kidock tracks: no component is
/// excluded and the file name is `.md`.
pub fn is_tracked(rel: &RelPath, rules: &ExclusionRules) -> bool {
    rel.file_name().is_some_and(is_markdown)
        && rel.components().iter().all(|c| !rules.is_excluded(c))
}

/// True if `name` has a `.md` extension (case-insensitive).
pub fn is_markdown(name: &str) -> bool {
    match name.rsplit_once('.') {
        Some((stem, ext)) => !stem.is_empty() && ext.eq_ignore_ascii_case("md"),
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_rules_exclude_git_node_modules_and_hidden() {
        let rules = ExclusionRules::default();
        for name in [".git", "node_modules", ".DS_Store", ".hidden.md", ".claude"] {
            assert!(rules.is_excluded(name), "{name}");
        }
        for name in ["notes", "report.md", "git", "modules"] {
            assert!(!rules.is_excluded(name), "{name}");
        }
    }

    #[test]
    fn temp_and_backup_names_are_excluded() {
        let rules = ExclusionRules::default();
        for name in [
            "report.md~",
            "report.md.tmp",
            "report.md.TMP",
            "x.temp",
            "a.swp",
            "a.swo",
            "big.md.part",
            "dl.crdownload",
        ] {
            assert!(rules.is_excluded(name), "{name}");
        }
        assert!(!rules.is_excluded("tmp"));
        assert!(!rules.is_excluded("report.md"));
    }

    #[test]
    fn tracked_requires_markdown_and_no_excluded_component() {
        let rules = ExclusionRules::default();
        let t = |s: &str| is_tracked(&RelPath::parse(s).unwrap(), &rules);
        assert!(t("report.md"));
        assert!(t("notes/2026/a.MD"));
        assert!(!t("report.txt"));
        assert!(!t(".git/a.md"));
        assert!(!t("docs/node_modules/x/readme.md"));
        assert!(!t("docs/.hidden/a.md"));
        assert!(!t(".a.md"));
        assert!(!t("a.md.tmp"));
        assert!(!t(""));
    }

    #[test]
    fn names_match_case_insensitively() {
        let rules = ExclusionRules::default();
        assert!(rules.is_excluded("Node_Modules"));
    }

    #[test]
    fn hidden_entries_are_kept_when_disabled() {
        let rules = ExclusionRules {
            names: vec![],
            exclude_hidden: false,
        };
        assert!(!rules.is_excluded(".notes"));
    }

    #[test]
    fn detects_markdown_extension_case_insensitively() {
        for name in ["a.md", "A.MD", "report.Md", "x.y.md"] {
            assert!(is_markdown(name), "{name}");
        }
        for name in ["a.markdown", "a.txt", "md", "a.md.bak", "a."] {
            assert!(!is_markdown(name), "{name}");
        }
    }
}
