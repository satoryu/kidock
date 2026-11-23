import type { ProjectInfo } from "../api/types";
import { Tree } from "./Tree";

type Props = {
  /** The selected project. */
  project: ProjectInfo | undefined;
  selectedRel: string | null;
  onSelectFile: (relPath: string) => void;
  /** Incremented when the project's files change on disk. */
  treeVersion: number;
};

/** Center bar for a project: its folder tree. (The Inbox has `InboxList`.) */
export function CenterBar({ project, selectedRel, onSelectFile, treeVersion }: Props) {
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
