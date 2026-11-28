//! Writing text to the system clipboard (#21).
//!
//! `tauri-plugin-clipboard-manager` is used only from Rust: the WebView has no
//! clipboard permission, so a page can ask Kidock to *write* text through
//! `copy_text` but can never read the clipboard.

use tauri::Runtime;

/// Something that can put plain text on the clipboard (faked in tests).
pub trait ClipboardWriter {
    fn write_text(&self, text: &str) -> Result<(), String>;
}

impl<R: Runtime> ClipboardWriter for tauri_plugin_clipboard_manager::Clipboard<R> {
    fn write_text(&self, text: &str) -> Result<(), String> {
        tauri_plugin_clipboard_manager::Clipboard::write_text(self, text).map_err(|e| e.to_string())
    }
}
