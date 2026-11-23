import { useState } from "react";
import type { ProjectInfo } from "../api/types";
import { messageFor } from "./errors";
import { Modal } from "./Modal";

type Props = {
  project: ProjectInfo;
  onCancel: () => void;
  /** Performs the removal; a rejection is shown in the dialog. */
  onConfirm: () => Promise<void>;
};

export function ConfirmDeleteDialog({ project, onCancel, onConfirm }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Delete project?"
      onClose={onCancel}
      actions={
        <>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={confirm} disabled={busy}>
            Delete
          </button>
        </>
      }
    >
      <p>
        <strong>{project.name}</strong> will be removed from Kidock.
      </p>
      <p className="muted">The folder and its files on disk are not touched.</p>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
    </Modal>
  );
}
