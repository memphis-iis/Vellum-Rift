import { useCallback, useEffect, useState } from "react";
import {
  deleteArtifact,
  listArtifacts,
  type SessionArtifact,
  updateArtifact,
} from "../api/gameState";
import { MaterialIcon } from "./MaterialIcon";

type PinsPanelProps = {
  sessionId: string;
  localPlayerId: string | null;
  pollMs?: number;
};

export function PinsPanel({ sessionId, localPlayerId, pollMs = 3000 }: PinsPanelProps) {
  const [pins, setPins] = useState<SessionArtifact[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const rows = await listArtifacts(sessionId);
      setPins(rows.filter((a) => a.artifactType === "waypoint" || !a.artifactType));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load pins");
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(id);
  }, [refresh, pollMs]);

  const canEdit = (pin: SessionArtifact) =>
    Boolean(localPlayerId && pin.createdBy === localPlayerId);

  const onSave = async (pin: SessionArtifact) => {
    const label = draft.trim() || "Pin";
    setBusy(true);
    try {
      await updateArtifact(sessionId, pin.id, { label });
      setEditingId(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (pin: SessionArtifact) => {
    if (!canEdit(pin)) return;
    setBusy(true);
    try {
      await deleteArtifact(sessionId, pin.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="vr-pins-panel" aria-label="Session pins">
      <h4 className="vr-pins-panel__title">
        <MaterialIcon name="push_pin" />
        Pins
      </h4>
      {error ? <p className="vr-pins-panel__error">{error}</p> : null}
      {pins.length === 0 ? (
        <p className="vr-pins-panel__empty">No pins yet. Press F in-world to place one.</p>
      ) : (
        <ul className="vr-pins-panel__list">
          {pins.map((pin) => {
            const owned = canEdit(pin);
            const isEditing = editingId === pin.id;
            const display = pin.label?.trim() || "Pin";
            return (
              <li key={pin.id} className="vr-pins-panel__row">
                {isEditing ? (
                  <input
                    className="vr-pins-panel__input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={256}
                    disabled={busy}
                    aria-label="Pin name"
                  />
                ) : (
                  <span className="vr-pins-panel__label">{display}</span>
                )}
                {owned ? (
                  <span className="vr-pins-panel__actions">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          className="vr-enter__text-btn"
                          disabled={busy}
                          onClick={() => void onSave(pin)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="vr-enter__text-btn"
                          disabled={busy}
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="vr-enter__text-btn"
                          disabled={busy}
                          onClick={() => {
                            setEditingId(pin.id);
                            setDraft(display);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="vr-enter__text-btn"
                          disabled={busy}
                          onClick={() => void onDelete(pin)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
