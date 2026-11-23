//! Deciding whether a file "actually changed", from its last known state and
//! what is on disk now. Event kinds from the OS are never trusted; they only
//! nominate paths to re-check (CLAUDE.md, design constraint 1).

use super::{ProjectId, RelPath};

/// What Kidock last saw of a tracked file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FileState {
    pub size: u64,
    pub mtime_ns: i64,
    pub hash: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangeKind {
    Created,
    Updated,
    Deleted,
}

impl ChangeKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Created => "created",
            Self::Updated => "updated",
            Self::Deleted => "deleted",
        }
    }
}

/// A detected change, ready for the Inbox / UI.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectChange {
    pub project: ProjectId,
    pub rel: RelPath,
    pub kind: ChangeKind,
}

/// How to update the stored state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StoreOp {
    Upsert(FileState),
    Delete,
    Keep,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Decision {
    pub change: Option<ChangeKind>,
    pub store: StoreOp,
}

/// Compares the last known state with the current one (`None` = absent or
/// not tracked). Identical content is never a change, even if mtime moved.
pub fn decide(known: Option<&FileState>, now: Option<&FileState>) -> Decision {
    match (known, now) {
        (None, None) => Decision {
            change: None,
            store: StoreOp::Keep,
        },
        (None, Some(n)) => Decision {
            change: Some(ChangeKind::Created),
            store: StoreOp::Upsert(*n),
        },
        (Some(_), None) => Decision {
            change: Some(ChangeKind::Deleted),
            store: StoreOp::Delete,
        },
        (Some(k), Some(n)) if k.hash != n.hash => Decision {
            change: Some(ChangeKind::Updated),
            store: StoreOp::Upsert(*n),
        },
        (Some(k), Some(n)) => Decision {
            change: None,
            store: if k == n {
                StoreOp::Keep
            } else {
                StoreOp::Upsert(*n)
            },
        },
    }
}

/// Whether the content must be read and hashed. When size and mtime both
/// match the known state, the known hash is reused.
pub fn needs_hash(known: Option<&FileState>, size: u64, mtime_ns: i64) -> bool {
    !known.is_some_and(|k| k.size == size && k.mtime_ns == mtime_ns)
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: FileState = FileState {
        size: 10,
        mtime_ns: 100,
        hash: 1,
    };

    #[test]
    fn new_file_is_created() {
        assert_eq!(
            decide(None, Some(&A)),
            Decision {
                change: Some(ChangeKind::Created),
                store: StoreOp::Upsert(A)
            }
        );
    }

    #[test]
    fn vanished_file_is_deleted() {
        assert_eq!(
            decide(Some(&A), None),
            Decision {
                change: Some(ChangeKind::Deleted),
                store: StoreOp::Delete
            }
        );
    }

    #[test]
    fn different_content_is_updated() {
        let b = FileState { hash: 2, ..A };
        assert_eq!(
            decide(Some(&A), Some(&b)),
            Decision {
                change: Some(ChangeKind::Updated),
                store: StoreOp::Upsert(b)
            }
        );
    }

    #[test]
    fn identical_rewrite_is_not_a_change_but_refreshes_mtime() {
        let touched = FileState { mtime_ns: 200, ..A };
        assert_eq!(
            decide(Some(&A), Some(&touched)),
            Decision {
                change: None,
                store: StoreOp::Upsert(touched)
            }
        );
        assert_eq!(
            decide(Some(&A), Some(&A)),
            Decision {
                change: None,
                store: StoreOp::Keep
            }
        );
    }

    #[test]
    fn absent_and_unknown_is_nothing() {
        assert_eq!(decide(None, None).change, None);
    }

    #[test]
    fn hash_is_skipped_only_when_size_and_mtime_match() {
        assert!(needs_hash(None, 10, 100));
        assert!(!needs_hash(Some(&A), 10, 100));
        assert!(needs_hash(Some(&A), 11, 100));
        assert!(needs_hash(Some(&A), 10, 101));
    }

    #[test]
    fn kinds_have_wire_names() {
        assert_eq!(ChangeKind::Created.as_str(), "created");
        assert_eq!(ChangeKind::Updated.as_str(), "updated");
        assert_eq!(ChangeKind::Deleted.as_str(), "deleted");
    }
}
