use tauri::{AppHandle, Manager, Runtime};

use crate::domain::{DomainError, RootFolder};

/// Allows the asset protocol to serve files under `root` (recursively).
/// The static scope in `tauri.conf.json` is empty, so registered folders are
/// the only readable locations. Requires tauri's `protocol-asset` feature.
pub fn allow_root<R: Runtime>(app: &AppHandle<R>, root: &RootFolder) -> Result<(), DomainError> {
    app.asset_protocol_scope()
        .allow_directory(&root.canonical_path, true)
        .map_err(|e| DomainError::Io(format!("failed to extend asset scope: {e}")))
}
