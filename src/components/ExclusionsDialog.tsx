import { useEffect, useId, useState } from "react";
import { useApi } from "../api/context";
import { KidockError } from "../api/types";
import { messageFor } from "./errors";
import { Modal } from "./Modal";

type Props = {
  onCancel: () => void;
  /** Called after the patterns were saved (trees should refresh). */
  onSaved: () => void;
};

/** Edits the exclusion patterns: one glob per line, matched against each name. */
export function ExclusionsDialog({ onCancel, onSaved }: Props) {
  const api = useApi();
  const fieldId = useId();
  const [text, setText] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getExclusions().then(
      ({ patterns, defaults }) => {
        setText(patterns.join("\n"));
        setDefaults(defaults);
      },
      (e: unknown) => setError(messageFor(e)),
    );
  }, [api]);

  async function save() {
    if (text === null) return;
    setBusy(true);
    try {
      await api.setExclusions(text.split("\n"));
      onSaved();
    } catch (e) {
      // Validation errors carry a specific message ("cannot contain '/'…").
      setError(e instanceof KidockError && e.kind === "InvalidPath" ? e.message : messageFor(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Exclusions"
      onClose={onCancel}
      actions={
        <>
          <button type="button" className="text-left-action" onClick={() => setText(defaults.join("\n"))} disabled={text === null}>
            Reset to defaults
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={save} disabled={text === null || busy}>
            Save
          </button>
        </>
      }
    >
      <label className="field" htmlFor={fieldId}>
        <span className="field-label">Patterns (one per line)</span>
      </label>
      <textarea
        id={fieldId}
        className="patterns"
        rows={10}
        spellCheck={false}
        value={text ?? ""}
        disabled={text === null}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="muted field-help">
        Each pattern is matched against every file and folder name (<code>*</code> and <code>?</code> wildcards,
        case-insensitive). A matching folder hides everything inside it. Changes apply to the tree and the Inbox;
        existing files never create notifications when they become visible.
      </p>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
    </Modal>
  );
}
