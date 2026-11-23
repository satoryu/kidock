import type { ProjectInfo } from "../api/types";
import { ProjectMenu } from "./ProjectMenu";

export type View = { kind: "inbox" } | { kind: "project"; id: number };

type Props = {
  projects: ProjectInfo[];
  view: View;
  onSelectInbox: () => void;
  onSelectProject: (id: number) => void;
  onAddProject: () => void;
  onDeleteProject: (project: ProjectInfo) => void;
};

/**
 * Left sidebar: Inbox entry and the Projects list. Each project row holds two
 * sibling buttons (select, and "⋯" actions) rather than nesting controls.
 */
export function Sidebar({
  projects,
  view,
  onSelectInbox,
  onSelectProject,
  onAddProject,
  onDeleteProject,
}: Props) {
  const inboxSelected = view.kind === "inbox";

  return (
    <nav className="sidebar" aria-label="Navigation">
      <div className={`nav-item${inboxSelected ? " is-selected" : ""}`}>
        <button
          type="button"
          className="nav-main"
          aria-current={inboxSelected ? "page" : undefined}
          onClick={onSelectInbox}
        >
          <span className="nav-icon" aria-hidden="true">
            📥
          </span>
          <span className="nav-label">Inbox</span>
        </button>
      </div>

      <div className="section-header">
        <h2 className="section-title">Projects</h2>
        <button type="button" className="icon-button" aria-label="Add project" onClick={onAddProject}>
          ＋
        </button>
      </div>

      {projects.length === 0 ? (
        <p className="sidebar-empty">No projects yet.</p>
      ) : (
        <ul className="project-list" aria-label="Projects">
          {projects.map((p) => {
            const selected = view.kind === "project" && view.id === p.id;
            return (
              <li
                key={p.id}
                className={`nav-item${selected ? " is-selected" : ""}${
                  p.available ? "" : " is-unavailable"
                }`}
              >
                <button
                  type="button"
                  className="nav-main"
                  aria-current={selected ? "page" : undefined}
                  title={p.available ? p.path : `${p.path} (folder not found)`}
                  onClick={() => onSelectProject(p.id)}
                >
                  <span className="nav-label">{p.name}</span>
                  {!p.available && (
                    <span className="nav-warning" role="img" aria-label="folder not found">
                      ⚠
                    </span>
                  )}
                </button>
                <ProjectMenu projectName={p.name} onDelete={() => onDeleteProject(p)} />
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
