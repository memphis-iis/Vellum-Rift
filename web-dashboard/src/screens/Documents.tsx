import { useEffect, useState } from "react";
import { MaterialIcon } from "../components/MaterialIcon";
import { ModelViewer } from "../components/ModelViewer";
import {
  fetchModelGlbObjectUrl,
  fetchModelMeta,
  fetchModels,
  type ModelMeta,
} from "../api/models";
import {
  createSession,
  fetchSessions,
  patchSessionPlaylist,
  type GameSession,
} from "../api/sessions";

type DocumentsProps = {
  /** Prefill from Upload “View” or deep-link. */
  initialModelId?: string | null;
  /** Prefill “Add to existing space” when arriving from Enter/Spaces (#143). */
  initialAddSessionId?: string | null;
  /** After “Open in new space”, navigate to Enter for that space. */
  onOpenInSpace?: (sessionId: string) => void;
};

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function optionLabel(m: ModelMeta): string {
  const name = m.label?.trim() || "Untitled manuscript";
  const when = m.createdAt ? new Date(m.createdAt).toLocaleString() : "";
  return when ? `${name} · ${when}` : name;
}

function spaceOptionLabel(s: GameSession): string {
  const name = s.label?.trim() || "Untitled space";
  const playlistLen = Array.isArray(s.playlist) ? s.playlist.length : 0;
  const vis = (s.visibility ?? "public") === "private" ? "Private" : "Public";
  return `${name} · ${vis} · ${playlistLen} manuscript${playlistLen === 1 ? "" : "s"}`;
}

export default function Documents({
  initialModelId = null,
  initialAddSessionId = null,
  onOpenInSpace,
}: DocumentsProps) {
  const [catalog, setCatalog] = useState<ModelMeta[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(initialModelId ?? "");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [meta, setMeta] = useState<ModelMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [spaces, setSpaces] = useState<GameSession[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(false);
  const [addTargetId, setAddTargetId] = useState(initialAddSessionId ?? "");
  const [setAsActive, setSetAsActive] = useState(true);
  const [bindBusy, setBindBusy] = useState(false);
  const [bindStatus, setBindStatus] = useState<string | null>(null);

  async function refreshCatalog() {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const models = await fetchModels(200);
      setCatalog(models);
    } catch (err) {
      setCatalog([]);
      setCatalogError(err instanceof Error ? err.message : "Failed to list manuscripts");
    } finally {
      setCatalogLoading(false);
    }
  }

  async function refreshSpaces() {
    setSpacesLoading(true);
    try {
      const list = await fetchSessions();
      const active = list.filter((s) => s.isActive);
      setSpaces(active);
      setAddTargetId((prev) => {
        const preferred = initialAddSessionId?.trim() || prev;
        if (preferred && active.some((s) => s.sessionId === preferred)) return preferred;
        return prev && active.some((s) => s.sessionId === prev) ? prev : "";
      });
    } catch {
      setSpaces([]);
    } finally {
      setSpacesLoading(false);
    }
  }

  useEffect(() => {
    void refreshCatalog();
  }, []);

  useEffect(() => {
    if (!initialAddSessionId?.trim()) return;
    setAddTargetId(initialAddSessionId.trim());
  }, [initialAddSessionId]);

  useEffect(() => {
    return () => {
      if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
    };
  }, [src]);

  useEffect(() => {
    if (!initialModelId) return;
    setSelectedId(initialModelId);
    void loadModel(initialModelId);
    // Intentionally only when parent passes a new model id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialModelId]);

  useEffect(() => {
    if (!activeId && !initialAddSessionId) return;
    void refreshSpaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, initialAddSessionId]);

  async function loadModel(rawId: string) {
    const modelId = rawId.trim();
    if (!modelId) {
      setError("Select a processed manuscript to view.");
      return;
    }

    setLoading(true);
    setError(null);
    setBindStatus(null);
    setMeta(null);

    let objectUrl: string | null = null;
    try {
      const [nextMeta, nextSrc] = await Promise.all([
        fetchModelMeta(modelId),
        fetchModelGlbObjectUrl(modelId),
      ]);
      objectUrl = nextSrc;
      setSrc((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return nextSrc;
      });
      setMeta(nextMeta);
      setActiveId(modelId);
      setSelectedId(modelId);
      setCatalog((prev) => {
        if (prev.some((m) => m.modelId === nextMeta.modelId)) return prev;
        return [nextMeta, ...prev];
      });
    } catch (err) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setSrc((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return null;
      });
      setActiveId(null);
      setError(err instanceof Error ? err.message : "Failed to load model");
    } finally {
      setLoading(false);
    }
  }

  const onSelect = (modelId: string) => {
    setSelectedId(modelId);
    if (modelId) void loadModel(modelId);
  };

  const modelId = activeId || selectedId.trim();

  const onOpenInNewSpace = async () => {
    if (!modelId || bindBusy) return;
    setBindBusy(true);
    setError(null);
    setBindStatus(null);
    try {
      const title = meta?.label?.trim() || "Learning space";
      const created = await createSession(title, "private");
      await patchSessionPlaylist(created.sessionId, {
        playlist: [modelId],
        activeModelId: modelId,
      });
      setBindStatus(`Opened in new space “${title}”.`);
      await refreshSpaces();
      onOpenInSpace?.(created.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open in new space");
    } finally {
      setBindBusy(false);
    }
  };

  const onAddToSpace = async () => {
    if (!modelId || !addTargetId || bindBusy) return;
    setBindBusy(true);
    setError(null);
    setBindStatus(null);
    try {
      const updated = await patchSessionPlaylist(addTargetId, {
        append: modelId,
        ...(setAsActive ? { activeModelId: modelId } : {}),
      });
      const name = updated.label?.trim() || "space";
      setBindStatus(
        setAsActive
          ? `Added and set active in “${name}”.`
          : `Added to “${name}” playlist.`,
      );
      await refreshSpaces();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to add to space (you must be the host)",
      );
    } finally {
      setBindBusy(false);
    }
  };

  return (
    <main className="vr-docs">
      <header className="vr-docs__header">
        <h1 className="vr-docs__title">Manuscript library</h1>
        <p className="vr-docs__lead">
          Browse processed manuscripts and preview their meshes. Open a new learning space from a
          manuscript, or add it to an existing space’s playlist.
        </p>
      </header>

      <div className="vr-docs__load">
        <label className="vr-docs__field" htmlFor="vr-docs-model-select">
          <span className="vr-docs__field-label">
            <MaterialIcon name="folder_open" />
            Processed manuscripts
          </span>
          <select
            id="vr-docs-model-select"
            className="vr-docs__select"
            value={selectedId}
            disabled={loading || catalogLoading}
            onChange={(e) => onSelect(e.target.value)}
          >
            <option value="">
              {catalogLoading
                ? "Loading library…"
                : catalog.length
                  ? "Select a manuscript…"
                  : "No processed manuscripts yet"}
            </option>
            {catalog.map((m) => (
              <option key={m.modelId} value={m.modelId}>
                {optionLabel(m)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="vr-btn vr-btn--outline"
          disabled={catalogLoading}
          onClick={() => void refreshCatalog()}
        >
          {catalogLoading ? "Refreshing…" : "Refresh list"}
        </button>
      </div>

      {catalogError ? <p className="vr-docs__error">{catalogError}</p> : null}
      {error ? <p className="vr-docs__error">{error}</p> : null}
      {bindStatus ? (
        <p className="vr-docs__status" role="status">
          {bindStatus}
        </p>
      ) : null}

      {modelId && !loading ? (
        <section className="vr-docs__bind" aria-label="Use in a learning space">
          <h2 className="vr-docs__bind-title">Use in a learning space</h2>
          <div className="vr-docs__bind-row">
            <button
              type="button"
              className="vr-btn vr-btn--primary"
              disabled={bindBusy || !modelId}
              onClick={() => void onOpenInNewSpace()}
            >
              <MaterialIcon name="add" filled />
              {bindBusy ? "Working…" : "Open in new space"}
            </button>
          </div>
          <div className="vr-docs__bind-add">
            <label className="vr-docs__field" htmlFor="vr-docs-space-select">
              <span className="vr-docs__field-label">
                <MaterialIcon name="hub" />
                Add to existing space
              </span>
              <select
                id="vr-docs-space-select"
                className="vr-docs__select"
                value={addTargetId}
                disabled={bindBusy || spacesLoading}
                onChange={(e) => setAddTargetId(e.target.value)}
              >
                <option value="">
                  {spacesLoading
                    ? "Loading spaces…"
                    : spaces.length
                      ? "Select a space…"
                      : "No active spaces yet"}
                </option>
                {spaces.map((s) => (
                  <option key={s.sessionId} value={s.sessionId}>
                    {spaceOptionLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="vr-docs__bind-check">
              <input
                type="checkbox"
                checked={setAsActive}
                disabled={bindBusy}
                onChange={(e) => setSetAsActive(e.target.checked)}
              />
              Set as active manuscript
            </label>
            <button
              type="button"
              className="vr-btn vr-btn--outline"
              disabled={bindBusy || !addTargetId || !modelId}
              onClick={() => void onAddToSpace()}
            >
              {bindBusy ? "Adding…" : "Add to space"}
            </button>
            <button
              type="button"
              className="vr-btn vr-btn--ghost"
              disabled={spacesLoading || bindBusy}
              onClick={() => void refreshSpaces()}
            >
              Refresh spaces
            </button>
          </div>
          <p className="vr-docs__bind-hint">
            You must be the space host to change its playlist. Non-host attempts return an error.
          </p>
        </section>
      ) : null}

      <section className="vr-docs__stage" aria-live="polite">
        {loading ? (
          <div className="vr-docs__empty">
            <MaterialIcon name="progress_activity" className="vr-docs__spinner" />
            <p>Fetching mesh from the rift…</p>
          </div>
        ) : null}

        {!loading && !src ? (
          <div className="vr-docs__empty">
            <MaterialIcon name="view_in_ar" className="vr-docs__empty-icon" />
            <p>
              {catalog.length
                ? "Select a manuscript above to load its mesh."
                : "No processed manuscripts yet. Upload a manuscript first."}
            </p>
          </div>
        ) : null}

        {!loading && src ? (
          <div className="vr-docs__viewer-wrap">
            <ModelViewer src={src} alt={meta?.label || `Model ${activeId}`} />
          </div>
        ) : null}
      </section>

      {meta ? (
        <aside className="vr-docs__meta" aria-label="Model metadata">
          <h2 className="vr-docs__meta-title">{meta.label || meta.modelId}</h2>
          <dl className="vr-docs__meta-grid">
            <div>
              <dt>Model ID</dt>
              <dd>{meta.modelId}</dd>
            </div>
            <div>
              <dt>Height mode</dt>
              <dd>{meta.heightMode}</dd>
            </div>
            <div>
              <dt>Dimensions</dt>
              <dd>
                {meta.width} × {meta.height}
              </dd>
            </div>
            <div>
              <dt>Vertices</dt>
              <dd>{meta.vertexCount.toLocaleString()}</dd>
            </div>
            <div>
              <dt>File size</dt>
              <dd>{formatBytes(meta.fileSize)}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{new Date(meta.createdAt).toLocaleString()}</dd>
            </div>
          </dl>
          <p className="vr-docs__hint">Drag to orbit · Scroll to zoom · Right-drag to pan</p>
        </aside>
      ) : null}
    </main>
  );
}
