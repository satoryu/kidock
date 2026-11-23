import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "../api/context";
import type { InboxCounts, InboxItem, ProjectInfo } from "../api/types";
import { AddProjectDialog } from "./AddProjectDialog";
import { CenterBar } from "./CenterBar";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { messageFor } from "./errors";
import { InboxList } from "./InboxList";
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
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [counts, setCounts] = useState<InboxCounts>({ total: 0, byProject: [] });

  const refreshInbox = useCallback(
    () =>
      Promise.all([api.listInbox(), api.inboxCounts()]).then(
        ([items, c]) => {
          setInbox(items);
          setCounts(c);
        },
        // Keep the last known Inbox; the next change or action retries.
        () => {},
      ),
    [api],
  );

  useEffect(() => {
    void refreshInbox();
  }, [refreshInbox]);

  // On changes: refresh the Inbox, and the open tree if its project changed.
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(
    () =>
      api.onChanges((changes) => {
        void refreshInbox();
        const v = viewRef.current;
        if (v.kind === "project" && changes.some((c) => c.projectId === v.id)) {
          setTreeVersion((n) => n + 1);
        }
      }),
    [api, refreshInbox],
  );

  /** Opens a file and marks its Inbox item read (if it has one). */
  function open(file: OpenFile) {
    setOpenFile(file);
    setInbox((items) =>
      items.map((i) =>
        i.projectId === file.projectId && i.relPath === file.relPath ? { ...i, read: true } : i,
      ),
    );
    void api.markRead(file.projectId, file.relPath).then(
      (changed) => {
        if (changed) void refreshInbox();
      },
      () => void refreshInbox(),
    );
  }

  async function markAllRead() {
    await api.markAllRead().catch(() => 0);
    await refreshInbox();
  }

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
    await Promise.all([refresh(), refreshInbox()]);
  }

  const current = view.kind === "project" ? projects.find((p) => p.id === view.id) : undefined;
  const placeholder =
    projects.length === 0
      ? "Add a project to get started."
      : view.kind === "project"
        ? "Select a Markdown file."
        : "Select a notification.";

  return (
    <div className="app">
      <aside className="pane pane-sidebar">
        <Sidebar
          projects={projects}
          counts={counts}
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
        {view.kind === "inbox" ? (
          <InboxList
            items={inbox}
            unreadTotal={counts.total}
            selected={openFile}
            onOpen={(item) => open({ projectId: item.projectId, relPath: item.relPath })}
            onMarkAllRead={() => void markAllRead()}
          />
        ) : (
          <CenterBar
            project={current}
            selectedRel={openFile && current && openFile.projectId === current.id ? openFile.relPath : null}
            onSelectFile={(relPath) => current && open({ projectId: current.id, relPath })}
            treeVersion={treeVersion}
          />
        )}
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
