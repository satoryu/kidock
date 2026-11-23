//! Kidock backend.
//!
//! Layering: `commands` → `infra` → `domain`. `domain` is pure and must not
//! depend on Tauri or perform I/O.

pub mod commands;
pub mod domain;
pub mod infra;
pub mod state;

use tauri::{Builder, Manager, Runtime};

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
            let state = state::AppState::load(store)?;
            for project in state.projects_read().values().filter(|p| p.available) {
                infra::asset_scope::allow_root(app.handle(), &project.folder)?;
            }
            app.manage(state);
            Ok(())
        });
    with_commands(builder)
        .run(tauri::generate_context!())
        .expect("error while running Kidock");
}
