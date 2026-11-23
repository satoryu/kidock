//! Kidock backend.
//!
//! Layering: `commands` → `infra` → `domain`. `domain` is pure and must not
//! depend on Tauri or perform I/O.

pub mod commands;
pub mod domain;
pub mod infra;
pub mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::set_root,
            commands::list_dir,
            commands::read_markdown,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Kidock");
}
