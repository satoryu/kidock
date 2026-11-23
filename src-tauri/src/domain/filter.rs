/// Which directory entries are hidden from the tree (and, from #3, from watching).
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
    }
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
