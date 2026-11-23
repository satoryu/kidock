import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "../api/context";
import type { ProjectInfo } from "../api/types";
import { AddProjectDialog } from "./AddProjectDialog";
import { CenterBar } from "./CenterBar";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { messageFor } from "./errors";
import { Sidebar, type View } from "./Sidebar";
import { Viewer, type OpenFile } from "./Viewer";

type Dialog = { kind: "add" } | { kind: "delete"; project: ProjectInfo } | null;

/** Three-pane layout: sidebar | center bar | main area. */
export function App() {
  const api = useApi();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "inbox" });
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [treeVersion, setTreeVersion] = useState(0);

  // Refresh the open tree when its project changes on disk.
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(
    () =>
      api.onChanges((changes) => {
        const v = viewRef.current;
        if (v.kind === "project" && changes.some((c) => c.projectId === v.id)) {
          setTreeVersion((n) => n + 1);
        }
      }),
    [api],
  );

  const refresh = useCallback(
    () =>
      api.listProjects().then(
        (list) => {
          setProjects(list);
          setLoadError(null);
        },
        (e: unknown) => setLoadError(`Could not load projects. ${messageFor(e)}`),
      ),
    [api],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function selectProject(id: number) {
    if (view.kind === "project" && view.id === id) return;
    setView({ kind: "project", id });
    setOpenFile(null);
  }

  function selectInbox() {
    setView({ kind: "inbox" });
  }

  async function onAdded(project: ProjectInfo) {
    setDialog(null);
    await refresh();
    selectProject(project.id);
  }

  async function removeProject(project: ProjectInfo) {
    await api.removeProject(project.id);
    setDialog(null);
    if (view.kind === "project" && view.id === project.id) setView({ kind: "inbox" });
    if (openFile?.projectId === project.id) setOpenFile(null);
    await refresh();
  }

  const current = view.kind === "project" ? projects.find((p) => p.id === view.id) : undefined;
  const placeholder =
    projects.length === 0
      ? "Add a project to get started."
      : view.kind === "project"
        ? "Select a Markdown file."
        : "Select a project or a notification.";

  return (
    <div className="app">
      <aside className="pane pane-sidebar">
        <Sidebar
          projects={projects}
          view={view}
          onSelectInbox={selectInbox}
          onSelectProject={selectProject}
          onAddProject={() => setDialog({ kind: "add" })}
          onDeleteProject={(project) => setDialog({ kind: "delete", project })}
        />
        {loadError && (
          <div className="sidebar-error" role="alert">
            {loadError}
          </div>
        )}
      </aside>
      <div className="pane pane-center">
        <CenterBar
          view={view}
          project={current}
          selectedRel={openFile && current && openFile.projectId === current.id ? openFile.relPath : null}
          onSelectFile={(relPath) => current && setOpenFile({ projectId: current.id, relPath })}
          treeVersion={treeVersion}
        />
      </div>
      <main className="pane pane-main">
        <Viewer file={openFile} placeholder={placeholder} />
      </main>

      {dialog?.kind === "add" && (
        <AddProjectDialog onCancel={() => setDialog(null)} onAdded={(p) => void onAdded(p)} />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDeleteDialog
          project={dialog.project}
          onCancel={() => setDialog(null)}
          onConfirm={() => removeProject(dialog.project)}
        />
      )}
    </div>
  );
}
