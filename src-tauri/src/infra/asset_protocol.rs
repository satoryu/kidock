//! The `kidock-asset` URI scheme: serves images referenced by Markdown files,
//! with the same project + `RelPath` + canonical-containment rule as
//! `read_markdown` (so symlinks cannot escape a project).
//!
//! URL path: `/<percent-encoded "projectId/rel/path">` (built by the frontend
//! with `convertFileSrc`).

use std::fs;

use crate::domain::percent::percent_decode;
use crate::domain::{ProjectId, RelPath};
use crate::infra::fs_reader;
use crate::state::AppState;

pub const SCHEME: &str = "kidock-asset";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Served {
    pub status: u16,
    pub content_type: &'static str,
    pub body: Vec<u8>,
}

impl Served {
    /// The app state is not ready yet (the WebView raced startup).
    pub fn unavailable() -> Self {
        Self::error(503)
    }

    fn error(status: u16) -> Self {
        Self {
            status,
            content_type: "text/plain",
            body: Vec::new(),
        }
    }
}

/// Image types Kidock serves, by lowercase extension.
fn content_type(rel: &RelPath) -> Option<&'static str> {
    let ext = rel.file_name()?.rsplit_once('.')?.1.to_ascii_lowercase();
    Some(match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        _ => return None,
    })
}

/// Resolves and reads the asset for a request path (`uri.path()`).
pub fn serve(state: &AppState, uri_path: &str) -> Served {
    let Some(decoded) = percent_decode(uri_path.trim_start_matches('/')) else {
        return Served::error(400);
    };
    let Some((id, rel)) = decoded.split_once('/') else {
        return Served::error(400);
    };
    let Ok(id) = id.parse::<i64>() else {
        return Served::error(400);
    };
    let Ok(project) = state.project(ProjectId(id)) else {
        return Served::error(404);
    };
    if !project.available {
        return Served::error(404);
    }
    let Ok(rel) = RelPath::parse(rel) else {
        return Served::error(403);
    };
    let Some(mime) = content_type(&rel) else {
        return Served::error(415);
    };
    let path = match fs_reader::resolve(&project.folder, &rel) {
        Ok(p) => p,
        Err(crate::domain::DomainError::OutsideRoot) => return Served::error(403),
        Err(_) => return Served::error(404),
    };
    // Re-check after resolving: an allowed name may be a symlink to another type.
    let target_type = path
        .file_name()
        .and_then(|n| n.to_str())
        .and_then(|n| RelPath::parse(n).ok())
        .and_then(|r| content_type(&r));
    if target_type != Some(mime) {
        return Served::error(415);
    }
    match fs::read(&path) {
        Ok(body) => Served {
            status: 200,
            content_type: mime,
            body,
        },
        Err(_) => Served::error(404),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infra::store::Store;
    use tempfile::TempDir;

    fn setup() -> (TempDir, AppState, i64) {
        let dir = TempDir::new().unwrap();
        let root = dunce::canonicalize(dir.path()).unwrap();
        fs::create_dir_all(root.join("docs/img")).unwrap();
        fs::write(root.join("docs/img/a b.png"), b"\x89PNG").unwrap();
        fs::write(root.join("notes.md"), "# md").unwrap();
        let store = Store::open_in_memory().unwrap();
        let id = store.insert_project("p", &root.to_string_lossy()).unwrap();
        let state = AppState::load(store).unwrap();
        (dir, state, id.0)
    }

    #[test]
    fn serves_an_image_inside_the_project() {
        let (_d, state, id) = setup();
        let r = serve(&state, &format!("/{id}%2Fdocs%2Fimg%2Fa%20b.png"));
        assert_eq!(
            (r.status, r.content_type, r.body),
            (200, "image/png", b"\x89PNG".to_vec())
        );
    }

    #[test]
    fn rejects_bad_requests_unknown_projects_and_missing_files() {
        let (_d, state, id) = setup();
        assert_eq!(serve(&state, "/not-a-number%2Fa.png").status, 400);
        assert_eq!(serve(&state, "/%zz").status, 400);
        assert_eq!(serve(&state, "/999%2Fa.png").status, 404);
        assert_eq!(serve(&state, &format!("/{id}%2Fmissing.png")).status, 404);
    }

    #[test]
    fn refuses_escapes_and_non_image_types() {
        let (_d, state, id) = setup();
        assert_eq!(
            serve(&state, &format!("/{id}%2F..%2F..%2Fetc%2Fx.png")).status,
            403
        );
        assert_eq!(
            serve(&state, &format!("/{id}%2F%2Fetc%2Fx.png")).status,
            403
        );
        assert_eq!(serve(&state, &format!("/{id}%2Fnotes.md")).status, 415);
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_symlink_that_escapes_the_project() {
        let (dir, state, id) = setup();
        let outside = TempDir::new().unwrap();
        fs::write(outside.path().join("secret.png"), b"secret").unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("secret.png"),
            dir.path().join("link.png"),
        )
        .unwrap();
        assert_eq!(serve(&state, &format!("/{id}%2Flink.png")).status, 403);
    }

    #[cfg(unix)]
    #[test]
    fn refuses_an_image_name_that_links_to_another_type() {
        let (dir, state, id) = setup();
        std::os::unix::fs::symlink(dir.path().join("notes.md"), dir.path().join("fake.png"))
            .unwrap();
        assert_eq!(serve(&state, &format!("/{id}%2Ffake.png")).status, 415);
    }
}
