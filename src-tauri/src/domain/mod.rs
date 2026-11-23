//! Pure domain logic. Must not depend on Tauri or perform filesystem I/O.

pub mod change;
pub mod entry;
pub mod error;
pub mod filter;
pub mod hash;
pub mod inbox;
pub mod notice;
pub mod project;
pub mod rel_path;
pub mod root;
pub mod sort;

pub use change::{ChangeKind, Decision, FileState, ProjectChange, StoreOp, decide, needs_hash};
pub use entry::{EntryKind, RawEntry, TreeEntry};
pub use error::DomainError;
pub use filter::{ExclusionRules, is_tracked};
pub use project::{Project, ProjectId, check_overlap, project_name};
pub use rel_path::RelPath;
pub use root::RootFolder;
