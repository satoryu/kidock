use super::{DomainError, RelPath};

/// Default exclusion patterns: VCS and dependency folders, hidden entries,
/// and temp/backup files that editors and agents write before an atomic rename.
pub const DEFAULT_PATTERNS: &[&str] = &[
    ".git",
    "node_modules",
    ".*",
    "*~",
    "*.tmp",
    "*.temp",
    "*.swp",
    "*.swo",
    "*.part",
    "*.crdownload",
];

/// Upper bound on user-defined patterns.
pub const MAX_PATTERNS: usize = 200;

/// Which entries are hidden from the tree and ignored by the watcher: glob
/// patterns (`*`, `?`) matched ASCII-case-insensitively against each path
/// component, like gitignore basename patterns.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExclusionRules {
    patterns: Vec<String>,
}

impl Default for ExclusionRules {
    fn default() -> Self {
        Self {
            patterns: DEFAULT_PATTERNS.iter().map(|p| p.to_string()).collect(),
        }
    }
}

impl ExclusionRules {
    /// Validates user input: one pattern per entry, trimmed; blanks dropped.
    pub fn from_patterns<S: AsRef<str>>(lines: &[S]) -> Result<Self, DomainError> {
        let patterns: Vec<String> = lines
            .iter()
            .map(|l| l.as_ref().trim().to_string())
            .filter(|l| !l.is_empty())
            .collect();
        if patterns.len() > MAX_PATTERNS {
            return Err(DomainError::InvalidPath(format!(
                "at most {MAX_PATTERNS} patterns are allowed"
            )));
        }
        if let Some(bad) = patterns.iter().find(|p| p.contains(['/', '\\'])) {
            return Err(DomainError::InvalidPath(format!(
                "patterns match a single name and cannot contain '/' or '\\': {bad}"
            )));
        }
        Ok(Self { patterns })
    }

    pub fn patterns(&self) -> &[String] {
        &self.patterns
    }

    pub fn is_excluded(&self, name: &str) -> bool {
        self.patterns.iter().any(|p| glob_match(p, name))
    }
}

/// Glob match of a whole name: `*` = any run (incl. empty), `?` = one char,
/// ASCII case-insensitive. Two-pointer matching with backtracking to the last
/// `*`: O(pattern × name), no regex built from user input.
pub fn glob_match(pattern: &str, name: &str) -> bool {
    let p: Vec<char> = pattern.chars().collect();
    let n: Vec<char> = name.chars().collect();
    let (mut pi, mut ni) = (0, 0);
    let mut star: Option<(usize, usize)> = None;
    while ni < n.len() {
        if pi < p.len() && (p[pi] == '?' || p[pi].eq_ignore_ascii_case(&n[ni])) {
            pi += 1;
            ni += 1;
        } else if pi < p.len() && p[pi] == '*' {
            star = Some((pi, ni));
            pi += 1;
        } else if let Some((sp, sn)) = star {
            pi = sp + 1;
            ni = sn + 1;
            star = Some((sp, sn + 1));
        } else {
            return false;
        }
    }
    p[pi..].iter().all(|&c| c == '*')
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
    fn custom_patterns_replace_the_defaults() {
        let rules =
            ExclusionRules::from_patterns(&["scratch", "*.log", "  ", "draft-??.md"]).unwrap();
        assert_eq!(rules.patterns(), ["scratch", "*.log", "draft-??.md"]);
        assert!(rules.is_excluded("Scratch"));
        assert!(rules.is_excluded("run.LOG"));
        assert!(rules.is_excluded("draft-01.md"));
        assert!(!rules.is_excluded("draft-001.md"));
        assert!(!rules.is_excluded(".notes")); // hidden entries are visible without ".*"
        assert!(!rules.is_excluded("node_modules"));
    }

    #[test]
    fn invalid_patterns_are_rejected() {
        assert!(ExclusionRules::from_patterns(&["a/b"]).is_err());
        assert!(ExclusionRules::from_patterns(&["a\\b"]).is_err());
        let many: Vec<String> = (0..=MAX_PATTERNS).map(|i| format!("p{i}")).collect();
        assert!(ExclusionRules::from_patterns(&many).is_err());
        assert!(
            ExclusionRules::from_patterns::<&str>(&[])
                .unwrap()
                .patterns()
                .is_empty()
        );
    }

    #[test]
    fn glob_matching() {
        for (p, n) in [
            ("*", "anything"),
            ("*.md", "a.md"),
            ("a*b*c", "aXXbYYc"),
            ("?", "x"),
            ("*~", "notes.md~"),
            (".*", ".git"),
            ("**", ""),
            ("NODE_modules", "node_MODULES"),
        ] {
            assert!(glob_match(p, n), "{p} vs {n}");
        }
        for (p, n) in [
            ("*.md", "a.mdx"),
            ("?", ""),
            ("a*b", "ac"),
            (".*", "x.y"),
            ("abc", "ab"),
        ] {
            assert!(!glob_match(p, n), "{p} vs {n}");
        }
        // Linear-ish even for adversarial input.
        let name = "a".repeat(2000);
        assert!(!glob_match("*a*a*a*a*a*a*a*b", &name));
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
