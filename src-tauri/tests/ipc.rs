//! IPC-level tests: invoke commands the way the WebView does (JSON bodies with
//! camelCase argument names) through Tauri's mock runtime. This catches
//! mismatches between `src/api/tauriApi.ts` and the Rust command signatures.
//!
//! Not built on Windows: tauri-build embeds the Common Controls v6 manifest
//! only into the app binary, so a test executable that links the Tauri runtime
//! fails to start there (`STATUS_ENTRYPOINT_NOT_FOUND`, seen on CI). The
//! argument naming checked here is platform-independent, so macOS CI covers it.
#![cfg(not(windows))]

use std::fs;

use kidock_lib::infra::store::Store;
use kidock_lib::state::AppState;
use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
};
use tauri::webview::InvokeRequest;
use tauri::{App, WebviewWindow, WebviewWindowBuilder};
use tempfile::TempDir;

fn app() -> (App<MockRuntime>, WebviewWindow<MockRuntime>) {
    let state = AppState::load(Store::open_in_memory().unwrap()).unwrap();
    let app = kidock_lib::with_commands(mock_builder().manage(state))
        .build(mock_context(noop_assets()))
        .unwrap();
    let webview = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    (app, webview)
}

fn invoke(webview: &WebviewWindow<MockRuntime>, cmd: &str, body: Value) -> Result<Value, Value> {
    get_ipc_response(
        webview,
        InvokeRequest {
            cmd: cmd.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: if cfg!(windows) {
                "http://tauri.localhost"
            } else {
                "tauri://localhost"
            }
            .parse()
            .unwrap(),
            body: InvokeBody::Json(body),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        },
    )
    .map(|b| b.deserialize::<Value>().unwrap())
}

#[test]
fn project_lifecycle_over_ipc() {
    let dir = TempDir::new().unwrap();
    fs::create_dir(dir.path().join("docs")).unwrap();
    fs::write(dir.path().join("docs/a.md"), "# A").unwrap();
    let (_app, webview) = app();

    assert_eq!(invoke(&webview, "list_projects", json!({})), Ok(json!([])));

    let added = invoke(
        &webview,
        "add_project",
        json!({ "name": null, "path": dir.path().to_string_lossy() }),
    )
    .unwrap();
    let id = added["id"].as_i64().unwrap();
    assert_eq!(added["available"], json!(true));
    assert_eq!(
        added["name"],
        json!(dir.path().file_name().unwrap().to_string_lossy())
    );

    let listing = invoke(
        &webview,
        "list_dir",
        json!({ "projectId": id, "rel": "docs" }),
    )
    .unwrap();
    assert_eq!(
        listing,
        json!([{ "name": "a.md", "relPath": "docs/a.md", "kind": "markdown" }])
    );
    assert_eq!(
        invoke(
            &webview,
            "read_markdown",
            json!({ "projectId": id, "rel": "docs/a.md" })
        ),
        Ok(json!("# A"))
    );

    let err = invoke(
        &webview,
        "add_project",
        json!({ "name": "again", "path": dir.path().to_string_lossy() }),
    )
    .unwrap_err();
    assert_eq!(err["kind"], json!("AlreadyRegistered"));

    assert_eq!(
        invoke(&webview, "remove_project", json!({ "projectId": id })),
        Ok(Value::Null)
    );
    let err = invoke(&webview, "list_dir", json!({ "projectId": id, "rel": "" })).unwrap_err();
    assert_eq!(err["kind"], json!("ProjectNotFound"));
    assert!(dir.path().join("docs/a.md").exists());
}
