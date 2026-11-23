//! Pure domain logic. Must not depend on Tauri or perform filesystem I/O.

pub mod entry;
pub mod error;
pub mod filter;
pub mod rel_path;
pub mod root;
pub mod sort;

pub use entry::{EntryKind, RawEntry, TreeEntry};
pub use error::DomainError;
pub use filter::ExclusionRules;
pub use rel_path::RelPath;
pub use root::{RootFolder, RootId};
