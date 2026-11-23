# Issue #5 — Requirements: Projects, three-pane layout

## Problem Statement

#1 lets the owner open one folder at a time, and forgets it on restart. Kidock's purpose is to watch several agent output folders continuously, so the folders must become persistent **projects**. The screen also needs the layout that the Inbox (#7) will live in: left sidebar, center bar, main area.

## Requirements

### Functional

- **F1 — Three-pane layout**: left sidebar | center bar | main area, each scrolling independently.
- **F2 — Sidebar**: an **Inbox** entry at the top (placeholder until #7: selecting it shows an empty state in the center bar), then a **Projects** section.
- **F3 — Projects header**: the text "Projects" with a **"+"** icon button on its right, labelled "Add project" for accessibility.
- **F4 — Add-project dialog** (modal):
  - a **Project name** text field (optional)
  - a **Folder** field: a read-only display of the chosen path plus a "Choose…" button that opens the OS folder picker
  - **Cancel** and **Add** buttons. Add is disabled until a folder is chosen.
  - An empty or whitespace-only name falls back to the folder's name. Names are trimmed and limited to 100 characters.
  - Errors (already registered, overlapping, unreadable folder) are shown inside the dialog, which stays open.
  - Escape and Cancel close it without changes.
- **F5 — Overlap rule**: a folder is rejected if it is the same as, inside, or contains a registered project's folder (compared on canonical paths, case-insensitively on macOS/Windows). This keeps each file in exactly one project, so #6/#7 never produce duplicate changes.
- **F6 — Project list**: one row per project showing its name, sorted by name (case-insensitive) and then by id. Each row has a **"⋯"** button ("Project actions") at its right edge that opens a menu.
- **F7 — Delete**: the menu has **Delete**. It opens a confirmation modal naming the project and stating that the files on disk are not touched. Confirming removes the project. If it was selected, the selection is cleared.
- **F8 — Project tree**: clicking a project shows its folder tree in the center bar (the lazy tree from #1).
- **F9 — Viewer**: clicking a `.md` file renders it in the main area (#1's renderer and sanitizer).
- **F10 — Persistence**: projects are stored in SQLite in the app data directory and restored on startup.
- **F11 — Missing folders**: a project whose folder no longer exists (or is not a directory) at startup is still listed, marked as unavailable. Its tree shows "folder not found". It can be deleted.

### Non-Functional

- **N1 — Path safety**: every file command takes `(projectId, rel)`. The project must exist, and `rel` follows #1's rule (`RelPath` + canonical containment). A removed project's id is rejected.
- **N2 — Asset scope**: on startup and on add, only registered, existing project folders are allowed. A removed project's folder stays in the scope until restart, because Tauri cannot revoke it. Kidock's own commands reject it immediately.
- **N3 — Accessibility**: dialogs use `role="dialog"`, `aria-modal`, a labelled title, focus on open, and Escape to close. The menu uses `role="menu"`/`menuitem` and closes on Escape or an outside click.
- **N4 — Responsiveness**: SQLite access happens in async commands (thread pool), never on the main thread.

## Constraints

- No file watching and no Inbox content (#6, #7).
- Renaming and reordering projects are out of scope.
- The DB schema is versioned (`PRAGMA user_version`) so #6/#7 can add tables with migrations.

## Acceptance Criteria

- **AC1**: Adding a project with a name and without one works. The default name is the folder name.
- **AC2**: Projects survive an app restart.
- **AC3**: Adding a duplicate, nested, or containing folder is rejected with a message in the dialog.
- **AC4**: Delete asks for confirmation, removes the project, and leaves the files untouched.
- **AC5**: Project → tree → file works across several projects. Switching projects resets the open file.
- **AC6**: File commands reject unknown or removed project ids and paths outside the project.
- **AC7**: A project with a missing folder shows as unavailable and can be deleted.
- **AC8**: CI is green on macOS and Windows. The real app is checked on macOS.

## User Stories

- As the owner, I register each agent's output folder once and find them again after a restart.
- As the owner, I remove a folder from Kidock without any risk to its files.
- As the owner, I switch between projects and read their Markdown in a layout that will soon show the Inbox.
