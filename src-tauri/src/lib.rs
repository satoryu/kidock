//! Kidock backend.
//!
//! Layering: `commands` → `infra` → `domain`. `domain` is pure and must not
//! depend on Tauri or perform I/O.

pub mod commands;
pub mod domain;
pub mod infra;
pub mod state;

use std::sync::Arc;

use tauri::{Builder, Manager, Runtime};

use infra::detector::{Detector, Msg};
use infra::sink::AppSink;
use infra::watcher::{DEBOUNCE, Watchers};

/// File name of the SQLite database inside the app data directory.
const DB_FILE: &str = "kidock.db";

/// Registers Kidock's IPC commands. Shared with the IPC-level tests.
pub fn with_commands<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    builder.invoke_handler(tauri::generate_handler![
        commands::list_projects,
        commands::add_project,
        commands::remove_project,
        commands::list_dir,
        commands::read_markdown,
        commands::list_inbox,
        commands::inbox_counts,
        commands::mark_read,
        commands::mark_all_read,
    ])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let store = infra::store::Store::open(&dir.join(DB_FILE))?;
            let state = Arc::new(state::AppState::load(store)?);

            let sink = Arc::new(AppSink::new(Arc::downgrade(&state), app.handle().clone()));
            let mut watchers = Watchers::new(Detector::new(state.clone(), sink).spawn(), DEBOUNCE);
            let available: Vec<_> = state
                .projects_read()
                .values()
                .filter(|p| p.available)
                .cloned()
                .collect();
            for project in available {
                infra::asset_scope::allow_root(app.handle(), &project.folder)?;
                // Projects from before #6 were never baselined: record them
                // silently instead of reporting every file as created.
                let msg = if state.store().is_baselined(project.id)? {
                    Msg::Rescan(project.id)
                } else {
                    Msg::Baseline(project.id)
                };
                watchers.send(msg);
                if let Err(e) = watchers.start(project.id, &project.folder.canonical_path) {
                    eprintln!(
                        "kidock: cannot watch {}: {e}",
                        project.folder.canonical_path.display()
                    );
                }
            }
            state.set_watchers(watchers);
            app.manage(state);
            Ok(())
        });
    with_commands(builder)
        .run(tauri::generate_context!())
        .expect("error while running Kidock");
}
