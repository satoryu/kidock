//! Inbox rules: one item per file, newest change on top, read/unread state.

use super::ChangeKind;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ItemKind {
    Created,
    Updated,
}

impl ItemKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Created => "created",
            Self::Updated => "updated",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "created" => Some(Self::Created),
            "updated" => Some(Self::Updated),
            _ => None,
        }
    }
}

/// The mutable part of an Inbox item (its key is project + path).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ItemState {
    pub kind: ItemKind,
    pub changed_at_ms: i64,
    pub read: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InboxOp {
    Upsert(ItemState),
    Remove,
    Keep,
}

/// How a detected change updates the file's Inbox item.
///
/// - Any create/update makes the item unread and moves it to the top.
/// - An unread `created` stays `created`: the owner has not seen the file yet.
/// - A deletion removes the item (the Inbox lists existing files only).
pub fn apply(existing: Option<&ItemState>, change: ChangeKind, now_ms: i64) -> InboxOp {
    let kind = match change {
        ChangeKind::Deleted => {
            return if existing.is_some() {
                InboxOp::Remove
            } else {
                InboxOp::Keep
            };
        }
        ChangeKind::Created => ItemKind::Created,
        ChangeKind::Updated => match existing {
            Some(e) if !e.read && e.kind == ItemKind::Created => ItemKind::Created,
            _ => ItemKind::Updated,
        },
    };
    InboxOp::Upsert(ItemState {
        kind,
        changed_at_ms: now_ms,
        read: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(kind: ItemKind, read: bool) -> ItemState {
        ItemState {
            kind,
            changed_at_ms: 1,
            read,
        }
    }

    fn unread(kind: ItemKind) -> InboxOp {
        InboxOp::Upsert(ItemState {
            kind,
            changed_at_ms: 9,
            read: false,
        })
    }

    #[test]
    fn a_new_file_becomes_an_unread_item_of_its_kind() {
        assert_eq!(
            apply(None, ChangeKind::Created, 9),
            unread(ItemKind::Created)
        );
        assert_eq!(
            apply(None, ChangeKind::Updated, 9),
            unread(ItemKind::Updated)
        );
    }

    #[test]
    fn an_unread_created_item_stays_created_when_updated() {
        let e = item(ItemKind::Created, false);
        assert_eq!(
            apply(Some(&e), ChangeKind::Updated, 9),
            unread(ItemKind::Created)
        );
    }

    #[test]
    fn a_read_item_becomes_unread_with_the_new_kind() {
        let created_read = item(ItemKind::Created, true);
        assert_eq!(
            apply(Some(&created_read), ChangeKind::Updated, 9),
            unread(ItemKind::Updated)
        );
        let updated_read = item(ItemKind::Updated, true);
        assert_eq!(
            apply(Some(&updated_read), ChangeKind::Created, 9),
            unread(ItemKind::Created)
        );
    }

    #[test]
    fn an_unread_updated_item_moves_to_the_top() {
        let e = item(ItemKind::Updated, false);
        assert_eq!(
            apply(Some(&e), ChangeKind::Updated, 9),
            unread(ItemKind::Updated)
        );
    }

    #[test]
    fn deletion_removes_an_existing_item_only() {
        let e = item(ItemKind::Updated, false);
        assert_eq!(apply(Some(&e), ChangeKind::Deleted, 9), InboxOp::Remove);
        assert_eq!(apply(None, ChangeKind::Deleted, 9), InboxOp::Keep);
    }

    #[test]
    fn kinds_round_trip_through_their_names() {
        for k in [ItemKind::Created, ItemKind::Updated] {
            assert_eq!(ItemKind::parse(k.as_str()), Some(k));
        }
        assert_eq!(ItemKind::parse("deleted"), None);
    }
}
