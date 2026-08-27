import { useCallback, useEffect, useState } from "react";
import { MaterialIcon } from "../components/MaterialIcon";
import { fetchModels } from "../api/models";
import {
  sessionActiveModelId,
  sessionPlaylist,
  shortModelLabel,
} from "../api/playlistHelpers";
import {
  createSession,
  endSession,
  fetchSessions,
  resumeSession,
  type GameSession,
} from "../api/sessions";

type SessionsProps = {
  onEnterSession?: (sessionId: string) => void;
  onNewSessionUpload?: () => void;
  /** Jump to Library to add a manuscript to this space (#143). */
  onAddFromLibrary?: (sessionId: string) => void;
};

type StatusKind = "live" | "ready" | "archived";

function sessionStatus(s: GameSession): StatusKind {
  if (!s.isActive) return "archived";
  const live = (s.players ?? []).some((p) => p.isConnected);
  return live ? "live" : "ready";
}

function statusLabel(kind: StatusKind): string {
  if (kind === "live") return "LIVE";
  if (kind === "ready") return "READY";
  return "ARCHIVED";
}

function formatActivity(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(t).toLocaleString();
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export default function Sessions({
  onEnterSession,
  onNewSessionUpload,
  onAddFromLibrary,
}: SessionsProps) {
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newVisibility, setNewVisibility] = useState<"public" | "private">("private");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [modelLabels, setModelLabels] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSessions(await fetchSessions());
    } catch (err) {
      setSessions([]);
      setError(err instanceof Error ? err.message : "Failed to load spaces");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void fetchModels(200)
      .then((models) => {
        const map: Record<string, string> = {};
        for (const m of models) {
          if (m.modelId) map[m.modelId] = m.label?.trim() || m.modelId;
        }
        setModelLabels(map);
      })
      .catch(() => {
        /* labels optional */
      });
  }, []);

  const onCreate = async () => {
    const label = newLabel.trim() || `Learning space ${new Date().toLocaleString()}`;
    setCreating(true);
    setError(null);
    try {
      const created = await createSession(label, newVisibility);
      setNewLabel("");
      setSessions((prev) => [created, ...prev.filter((s) => s.sessionId !== created.sessionId)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create space");
    } finally {
      setCreating(false);
    }
  };

  const onResume = async (sessionId: string) => {
    setMenuOpenId(null);
    setError(null);
    try {
      const updated = await resumeSession(sessionId);
      setSessions((prev) => prev.map((s) => (s.sessionId === sessionId ? updated : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore space");
    }
  };

  const onArchive = async (sessionId: string) => {
    setMenuOpenId(null);
    setError(null);
    try {
      await endSession(sessionId);
      setSessions((prev) =>
        prev.map((s) => (s.sessionId === sessionId ? { ...s, isActive: false } : s)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive space");
    }
  };

  return (
    <main className="vr-sessions">
      <header className="vr-sessions__header">
        <div className="vr-sessions__header-copy">
          <h1 className="vr-sessions__title">Learning spaces</h1>
          <p className="vr-sessions__lead">
            Open saved virtual learning spaces for web and VR. Each space keeps your spatial layout,
            annotations, and who’s in the room.
          </p>
        </div>
        <button
          type="button"
          className="vr-btn vr-btn--ghost vr-sessions__new"
          disabled={creating}
          onClick={() => void onCreate()}
        >
          <MaterialIcon name="add" filled />
          {creating ? "Creating…" : "New space"}
        </button>
      </header>

      <section className="vr-sessions__create" aria-label="Name new space">
        <label className="vr-sessions__create-field" htmlFor="vr-session-label">
          <span className="vr-sessions__create-label">Space name (optional)</span>
          <input
            id="vr-session-label"
            className="vr-sessions__create-input"
            type="text"
            maxLength={120}
            placeholder="e.g. Codex fragment — room A"
            value={newLabel}
            disabled={creating}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void onCreate();
              }
            }}
          />
        </label>
        <fieldset className="vr-sessions__visibility" disabled={creating}>
          <legend className="vr-sessions__create-label">Visibility</legend>
          <label className="vr-sessions__visibility-option">
            <input
              type="radio"
              name="vr-session-visibility"
              checked={newVisibility === "private"}
              onChange={() => setNewVisibility("private")}
            />
            Private
          </label>
          <label className="vr-sessions__visibility-option">
            <input
              type="radio"
              name="vr-session-visibility"
              checked={newVisibility === "public"}
              onChange={() => setNewVisibility("public")}
            />
            Public
          </label>
        </fieldset>
        {onNewSessionUpload ? (
          <button type="button" className="vr-btn vr-btn--outline" onClick={onNewSessionUpload}>
            Upload manuscript
          </button>
        ) : null}
      </section>

      {error ? <p className="vr-sessions__error">{error}</p> : null}

      <section className="vr-sessions__panel" aria-live="polite">
        <div className="vr-sessions__table-head" aria-hidden="true">
          <span>Space name</span>
          <span>Status</span>
          <span>Last activity</span>
          <span className="vr-sessions__col-actions">Actions</span>
        </div>

        {loading ? (
          <p className="vr-sessions__empty">Loading spaces…</p>
        ) : null}

        {!loading && !sessions.length ? (
          <p className="vr-sessions__empty">
            No spaces yet. Create one with New space, or upload a manuscript first.
          </p>
        ) : null}

        {!loading
          ? sessions.map((session) => {
              const kind = sessionStatus(session);
              const name = session.label?.trim() || "Untitled space";
              const activeId = sessionActiveModelId(session);
              const playlist = sessionPlaylist(session);
              const manuscriptLine = activeId
                ? shortModelLabel(activeId, modelLabels[activeId])
                : playlist.length
                  ? `${playlist.length} in playlist · none active`
                  : "No document";
              return (
                <article
                  key={session.sessionId}
                  className={`vr-sessions__row vr-sessions__row--${kind}`}
                >
                  <div className="vr-sessions__name-block">
                    <button
                      type="button"
                      className="vr-sessions__name"
                      onClick={() => onEnterSession?.(session.sessionId)}
                    >
                      {name}
                    </button>
                    <span className="vr-sessions__manuscript" title={activeId ?? undefined}>
                      <MaterialIcon name="menu_book" />
                      {manuscriptLine}
                    </span>
                    <span className="vr-sessions__id">
                      ID: {shortId(session.sessionId)}
                      {" · "}
                      <span className="vr-sessions__visibility-tag">
                        {(session.visibility ?? "public") === "private" ? "Private" : "Public"}
                      </span>
                    </span>
                  </div>

                  <div className="vr-sessions__status-wrap">
                    <span className={`vr-sessions__badge vr-sessions__badge--${kind}`}>
                      {kind === "live" ? <span className="vr-sessions__pulse" /> : null}
                      {statusLabel(kind)}
                    </span>
                  </div>

                  <div className="vr-sessions__activity">{formatActivity(session.updatedAt)}</div>

                  <div className="vr-sessions__actions">
                    {kind === "archived" ? (
                      <button
                        type="button"
                        className="vr-sessions__icon-btn"
                        aria-label="Restore space"
                        title="Restore"
                        onClick={() => void onResume(session.sessionId)}
                      >
                        <MaterialIcon name="restore" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="vr-btn vr-btn--primary vr-sessions__launch"
                        onClick={() => onEnterSession?.(session.sessionId)}
                      >
                        <MaterialIcon name="rocket_launch" />
                        Launch
                      </button>
                    )}
                    <div className="vr-sessions__menu">
                      <button
                        type="button"
                        className="vr-sessions__icon-btn"
                        aria-label="More actions"
                        aria-expanded={menuOpenId === session.sessionId}
                        onClick={() =>
                          setMenuOpenId((id) =>
                            id === session.sessionId ? null : session.sessionId,
                          )
                        }
                      >
                        <MaterialIcon name="more_vert" />
                      </button>
                      {menuOpenId === session.sessionId ? (
                        <div className="vr-sessions__menu-pop" role="menu">
                          {kind !== "archived" ? (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuOpenId(null);
                                onEnterSession?.(session.sessionId);
                              }}
                            >
                              Enter space
                            </button>
                          ) : null}
                          {kind !== "archived" && onAddFromLibrary ? (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuOpenId(null);
                                onAddFromLibrary(session.sessionId);
                              }}
                            >
                              Add from library
                            </button>
                          ) : null}
                          {kind !== "archived" ? (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => void onArchive(session.sessionId)}
                            >
                              Archive
                            </button>
                          ) : (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => void onResume(session.sessionId)}
                            >
                              Restore
                            </button>
                          )}
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              void navigator.clipboard?.writeText(session.sessionId);
                              setMenuOpenId(null);
                            }}
                          >
                            Copy ID
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })
          : null}
      </section>
    </main>
  );
}
