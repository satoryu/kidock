//! What an OS notification says for a burst of changes.

use super::{ChangeKind, ProjectId, RelPath};

/// A change to notify about (deletions are dropped by [`dedupe`]).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoticeItem {
    pub project: ProjectId,
    pub project_name: String,
    pub rel: RelPath,
    pub kind: ChangeKind,
}

/// What a click on the notification opens.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NoticeTarget {
    File { project: ProjectId, rel: RelPath },
    Inbox,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Notice {
    pub title: String,
    pub body: String,
    pub target: NoticeTarget,
}

/// Names listed in a summary before "and N more".
const LISTED: usize = 3;

/// One entry per file (the last change wins), in first-seen order, without
/// deletions.
pub fn dedupe(items: Vec<NoticeItem>) -> Vec<NoticeItem> {
    let mut out: Vec<NoticeItem> = Vec::new();
    for item in items {
        if let Some(existing) = out
            .iter_mut()
            .find(|e| e.project == item.project && e.rel == item.rel)
        {
            existing.kind = item.kind;
        } else {
            out.push(item);
        }
    }
    out.retain(|i| i.kind != ChangeKind::Deleted);
    out
}

/// The notification for already-deduplicated items, or `None` for none.
pub fn summarize(items: &[NoticeItem]) -> Option<Notice> {
    match items {
        [] => None,
        [one] => {
            let verb = if one.kind == ChangeKind::Created {
                "New"
            } else {
                "Updated"
            };
            let (name, folder) = split(&one.rel);
            let body = if folder.is_empty() {
                one.project_name.clone()
            } else {
                format!("{} · {folder}", one.project_name)
            };
            Some(Notice {
                title: format!("{verb}: {name}"),
                body,
                target: NoticeTarget::File {
                    project: one.project,
                    rel: one.rel.clone(),
                },
            })
        }
        many => {
            let names: Vec<&str> = many.iter().take(LISTED).map(|i| split(&i.rel).0).collect();
            let mut list = names.join(", ");
            if many.len() > LISTED {
                list = format!("{list} and {} more", many.len() - LISTED);
            }
            let mut projects: Vec<ProjectId> = many.iter().map(|i| i.project).collect();
            projects.sort();
            projects.dedup();
            let place = if projects.len() == 1 {
                many[0].project_name.clone()
            } else {
                format!("in {} projects", projects.len())
            };
            Some(Notice {
                title: format!("{} files changed", many.len()),
                body: format!("{list} — {place}"),
                target: NoticeTarget::Inbox,
            })
        }
    }
}

/// `("c.md", "a/b")` for `a/b/c.md`.
fn split(rel: &RelPath) -> (&str, String) {
    let parts = rel.components();
    let name = parts.last().map(String::as_str).unwrap_or_default();
    (name, parts[..parts.len().saturating_sub(1)].join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(project: i64, name: &str, rel: &str, kind: ChangeKind) -> NoticeItem {
        NoticeItem {
            project: ProjectId(project),
            project_name: name.into(),
            rel: RelPath::parse(rel).unwrap(),
            kind,
        }
    }

    #[test]
    fn one_new_file() {
        let n = summarize(&[item(1, "reports", "plan.md", ChangeKind::Created)]).unwrap();
        assert_eq!(n.title, "New: plan.md");
        assert_eq!(n.body, "reports");
        assert_eq!(
            n.target,
            NoticeTarget::File {
                project: ProjectId(1),
                rel: RelPath::parse("plan.md").unwrap()
            }
        );
    }

    #[test]
    fn one_updated_nested_file_shows_its_folder() {
        let n = summarize(&[item(1, "reports", "docs/2026/plan.md", ChangeKind::Updated)]).unwrap();
        assert_eq!(n.title, "Updated: plan.md");
        assert_eq!(n.body, "reports · docs/2026");
    }

    #[test]
    fn several_files_in_one_project() {
        let n = summarize(&[
            item(1, "reports", "a.md", ChangeKind::Created),
            item(1, "reports", "x/b.md", ChangeKind::Updated),
        ])
        .unwrap();
        assert_eq!(n.title, "2 files changed");
        assert_eq!(n.body, "a.md, b.md — reports");
        assert_eq!(n.target, NoticeTarget::Inbox);
    }

    #[test]
    fn many_files_across_projects() {
        let items: Vec<_> = (0..5)
            .map(|i| item(i % 2 + 1, "p", &format!("f{i}.md"), ChangeKind::Created))
            .collect();
        let n = summarize(&items).unwrap();
        assert_eq!(n.title, "5 files changed");
        assert_eq!(n.body, "f0.md, f1.md, f2.md and 2 more — in 2 projects");
    }

    #[test]
    fn nothing_to_say_for_no_items() {
        assert_eq!(summarize(&[]), None);
    }

    #[test]
    fn dedupe_keeps_one_entry_per_file_with_the_last_kind_and_drops_deletions() {
        let out = dedupe(vec![
            item(1, "p", "a.md", ChangeKind::Created),
            item(1, "p", "b.md", ChangeKind::Updated),
            item(1, "p", "a.md", ChangeKind::Updated),
            item(2, "q", "a.md", ChangeKind::Created),
            item(1, "p", "b.md", ChangeKind::Deleted),
        ]);
        let summary: Vec<_> = out
            .iter()
            .map(|i| (i.project.0, i.rel.to_wire(), i.kind))
            .collect();
        assert_eq!(
            summary,
            [
                (1, "a.md".to_string(), ChangeKind::Updated),
                (2, "a.md".to_string(), ChangeKind::Created)
            ]
        );
    }
}
