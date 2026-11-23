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
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    api.getNotificationsEnabled().then(setNotificationsEnabled, () => {});
  }, [api]);

  async function toggleNotifications() {
    const next = !notificationsEnabled;
    setNotificationsEnabled(next);
    await api.setNotificationsEnabled(next).catch(() => setNotificationsEnabled(!next));
  }

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

  const [fileVersion, setFileVersion] = useState(0);

  // On changes: refresh the Inbox, the open tree if its project changed, and
  // the open file if it changed (re-rendered in place, scroll kept).
  const viewRef = useRef(view);
  viewRef.current = view;
  const openFileRef = useRef(openFile);
  openFileRef.current = openFile;
  useEffect(
    () =>
      api.onChanges((changes) => {
        const v = viewRef.current;
        if (v.kind === "project" && changes.some((c) => c.projectId === v.id)) {
          setTreeVersion((n) => n + 1);
        }
        const f = openFileRef.current;
        const own = f && changes.find((c) => c.projectId === f.projectId && c.relPath === f.relPath);
        if (own) {
          setFileVersion((n) => n + 1);
          // The owner is looking at it only if Kidock has focus.
          if (own.kind !== "deleted" && document.hasFocus()) {
            void api.markRead(own.projectId, own.relPath).finally(() => void refreshInbox());
            return;
          }
        }
        void refreshInbox();
      }),
    [api, refreshInbox],
  );

  // A click on an OS notification: show the Inbox, and open the file if any.
  const openRef = useRef<(file: OpenFile) => void>(() => {});
  useEffect(
    () =>
      api.onOpenRequest((request) => {
        setView({ kind: "inbox" });
        if (request.projectId !== null) {
          openRef.current({ projectId: request.projectId, relPath: request.relPath });
        }
      }),
    [api],
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

  openRef.current = open;

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
          notificationsEnabled={notificationsEnabled}
          onToggleNotifications={() => void toggleNotifications()}
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
        <Viewer file={openFile} version={fileVersion} placeholder={placeholder} />
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
