import { useState } from "react";
import { useApi } from "../api/context";
import type { RootInfo } from "../api/types";
import { messageFor } from "./errors";
import { Tree } from "./Tree";
import { Viewer } from "./Viewer";

export function App() {
  const api = useApi();
  const [root, setRoot] = useState<RootInfo | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function openFolder() {
    setBusy(true);
    try {
      const path = await api.pickFolder();
      if (!path) return;
      const info = await api.setRoot(path);
      setRoot(info);
      setSelected(null);
      setError(null);
    } catch (e) {
      setError(`Could not open the folder. ${messageFor(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar-header">
          <button type="button" onClick={openFolder} disabled={busy}>
            Open folder…
          </button>
          {root && (
            <div className="root-name" title={root.path}>
              {root.name}
            </div>
          )}
        </header>
        {error && (
          <div className="sidebar-error" role="alert">
            {error}
          </div>
        )}
        <nav className="sidebar-tree">
          {root && <Tree key={root.id} selected={selected} onSelect={setSelected} />}
        </nav>
      </aside>
      <main className="content">
        <Viewer hasRoot={root !== null} relPath={selected} />
      </main>
    </div>
  );
}
