import type { ProjectInfo } from "../api/types";
import type { View } from "./Sidebar";
import { Tree } from "./Tree";

type Props = {
  view: View;
  /** The selected project, when `view.kind === "project"`. */
  project: ProjectInfo | undefined;
  selectedRel: string | null;
  onSelectFile: (relPath: string) => void;
  /** Incremented when the project's files change on disk. */
  treeVersion: number;
};

/** Center bar: the Inbox list (#7) or the selected project's folder tree. */
export function CenterBar({ view, project, selectedRel, onSelectFile, treeVersion }: Props) {
  if (view.kind === "inbox") {
    return (
      <section className="center-bar" aria-label="Inbox">
        <header className="pane-header">
          <h2 className="pane-title">Inbox</h2>
        </header>
        <p className="pane-empty">No notifications yet.</p>
      </section>
    );
  }

  if (!project) return <section className="center-bar" aria-label="Project" />;

  return (
    <section className="center-bar" aria-label={project.name}>
      <header className="pane-header">
        <h2 className="pane-title" title={project.path}>
          {project.name}
        </h2>
      </header>
      {project.available ? (
        <Tree
          key={project.id}
          projectId={project.id}
          version={treeVersion}
          selected={selectedRel}
          onSelect={onSelectFile}
        />
      ) : (
        <p className="pane-empty pane-error" role="alert">
          Folder not found: {project.path}
        </p>
      )}
    </section>
  );
}
