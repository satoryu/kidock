//! Coalesces bursts of changes into one OS notification.
//!
//! The detector hands batches to this thread so notification delivery never
//! delays detection. The first batch opens a window; everything arriving
//! before it closes becomes a single notification.

use std::sync::Arc;
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender, channel};
use std::thread;
use std::time::{Duration, Instant};

use crate::domain::notice::{Notice, NoticeItem, dedupe, summarize};

/// How long after the first change of a burst to wait for more.
pub const WINDOW: Duration = Duration::from_secs(2);

/// Shows notifications; the production implementation talks to the OS.
pub trait Presenter: Send + Sync {
    /// Whether to show anything right now (enabled, and the app not focused).
    fn should_show(&self) -> bool;
    fn show(&self, notice: Notice);
}

/// Sends batches to the notifier thread.
#[derive(Clone)]
pub struct NotifierHandle(Sender<Vec<NoticeItem>>);

impl NotifierHandle {
    pub fn notify(&self, items: Vec<NoticeItem>) {
        if !items.is_empty() {
            let _ = self.0.send(items);
        }
    }
}

pub fn spawn(presenter: Arc<dyn Presenter>, window: Duration) -> NotifierHandle {
    let (tx, rx) = channel();
    thread::Builder::new()
        .name("kidock-notifier".into())
        .spawn(move || run(rx, presenter.as_ref(), window))
        .expect("failed to spawn the notifier thread");
    NotifierHandle(tx)
}

fn run(rx: Receiver<Vec<NoticeItem>>, presenter: &dyn Presenter, window: Duration) {
    // Each iteration handles one burst.
    while let Ok(first) = rx.recv() {
        let mut burst = first;
        let deadline = Instant::now() + window;
        while let Some(left) = deadline.checked_duration_since(Instant::now()) {
            match rx.recv_timeout(left) {
                Ok(more) => burst.extend(more),
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
        if let Some(notice) = summarize(&dedupe(burst))
            && presenter.should_show()
        {
            presenter.show(notice);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{ChangeKind, ProjectId, RelPath};
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicBool, Ordering};

    struct Fake {
        enabled: AtomicBool,
        shown: Mutex<Vec<Notice>>,
        tx: Mutex<Sender<()>>,
    }

    impl Presenter for Fake {
        fn should_show(&self) -> bool {
            self.enabled.load(Ordering::SeqCst)
        }
        fn show(&self, notice: Notice) {
            self.shown.lock().unwrap().push(notice);
            let _ = self.tx.lock().unwrap().send(());
        }
    }

    fn item(rel: &str, kind: ChangeKind) -> NoticeItem {
        NoticeItem {
            project: ProjectId(1),
            project_name: "p".into(),
            rel: RelPath::parse(rel).unwrap(),
            kind,
        }
    }

    fn setup(enabled: bool) -> (NotifierHandle, Arc<Fake>, Receiver<()>) {
        let (tx, rx) = channel();
        let fake = Arc::new(Fake {
            enabled: AtomicBool::new(enabled),
            shown: Mutex::new(vec![]),
            tx: Mutex::new(tx),
        });
        (spawn(fake.clone(), Duration::from_millis(150)), fake, rx)
    }

    #[test]
    fn a_burst_becomes_one_notification() {
        let (h, fake, shown) = setup(true);
        h.notify(vec![item("a.md", ChangeKind::Created)]);
        h.notify(vec![
            item("b.md", ChangeKind::Updated),
            item("a.md", ChangeKind::Updated),
        ]);
        shown.recv_timeout(Duration::from_secs(2)).unwrap();
        // Nothing else follows.
        assert!(shown.recv_timeout(Duration::from_millis(400)).is_err());
        let notices = fake.shown.lock().unwrap();
        assert_eq!(notices.len(), 1);
        assert_eq!(notices[0].title, "2 files changed");
    }

    #[test]
    fn separate_bursts_give_separate_notifications() {
        let (h, fake, shown) = setup(true);
        h.notify(vec![item("a.md", ChangeKind::Created)]);
        shown.recv_timeout(Duration::from_secs(2)).unwrap();
        h.notify(vec![item("b.md", ChangeKind::Created)]);
        shown.recv_timeout(Duration::from_secs(2)).unwrap();
        let titles: Vec<_> = fake
            .shown
            .lock()
            .unwrap()
            .iter()
            .map(|n| n.title.clone())
            .collect();
        assert_eq!(titles, ["New: a.md", "New: b.md"]);
    }

    #[test]
    fn nothing_is_shown_when_disabled_or_only_deletions() {
        let (h, fake, shown) = setup(false);
        h.notify(vec![item("a.md", ChangeKind::Created)]);
        assert!(shown.recv_timeout(Duration::from_millis(500)).is_err());

        fake.enabled.store(true, Ordering::SeqCst);
        h.notify(vec![item("a.md", ChangeKind::Deleted)]);
        assert!(shown.recv_timeout(Duration::from_millis(500)).is_err());
        assert!(fake.shown.lock().unwrap().is_empty());
    }
}
