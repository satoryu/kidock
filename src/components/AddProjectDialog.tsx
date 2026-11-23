import { useState, type FormEvent } from "react";
import { useApi } from "../api/context";
import type { ProjectInfo } from "../api/types";
import { messageFor } from "./errors";
import { Modal } from "./Modal";

type Props = {
  onCancel: () => void;
  onAdded: (project: ProjectInfo) => void;
};

/** "Add project": optional name + folder picker. Errors stay in the dialog. */
export function AddProjectDialog({ onCancel, onAdded }: Props) {
  const api = useApi();
  const [name, setName] = useState("");
  const [path, setPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose() {
    const picked = await api.pickFolder().catch(() => null);
    if (picked) {
      setPath(picked);
      setError(null);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!path || busy) return;
    setBusy(true);
    try {
      // The backend falls back to the folder name for an empty name.
      onAdded(await api.addProject(name.trim() === "" ? null : name, path));
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Add project"
      onClose={onCancel}
      actions={
        <>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" form="add-project-form" className="primary" disabled={!path || busy}>
            Add
          </button>
        </>
      }
    >
      <form id="add-project-form" className="form" onSubmit={submit}>
        <label className="field">
          <span className="field-label">Project name (optional)</span>
          <input
            type="text"
            value={name}
            maxLength={100}
            placeholder="Defaults to the folder name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="field">
          <span className="field-label" id="folder-label">
            Folder
          </span>
          <div className="folder-picker">
            <span className="folder-path" aria-labelledby="folder-label" title={path ?? undefined}>
              {path ?? "No folder chosen"}
            </span>
            <button type="button" onClick={choose}>
              Choose…
            </button>
          </div>
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
