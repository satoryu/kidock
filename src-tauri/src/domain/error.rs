use std::fmt;

/// Errors produced by domain rules and surfaced to the UI.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DomainError {
    /// No folder has been selected yet.
    NoRootSelected,
    /// The path is malformed (e.g. empty segment, drive letter, NUL).
    InvalidPath(String),
    /// The path points outside the registered folder.
    OutsideRoot,
    NotFound,
    PermissionDenied,
    NotADirectory,
    NotMarkdown,
    NotUtf8,
    /// Any other I/O failure, with a human-readable message.
    Io(String),
}

impl fmt::Display for DomainError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoRootSelected => write!(f, "no folder is selected"),
            Self::InvalidPath(reason) => write!(f, "invalid path: {reason}"),
            Self::OutsideRoot => write!(f, "path is outside the selected folder"),
            Self::NotFound => write!(f, "file or directory not found"),
            Self::PermissionDenied => write!(f, "permission denied"),
            Self::NotADirectory => write!(f, "not a directory"),
            Self::NotMarkdown => write!(f, "not a Markdown file"),
            Self::NotUtf8 => write!(f, "file is not valid UTF-8"),
            Self::Io(msg) => write!(f, "I/O error: {msg}"),
        }
    }
}

impl std::error::Error for DomainError {}
