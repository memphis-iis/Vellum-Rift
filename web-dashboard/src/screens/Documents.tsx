import { useEffect, useState } from "react";
import { MaterialIcon } from "../components/MaterialIcon";
import { ModelViewer } from "../components/ModelViewer";
import {
  fetchModelGlbObjectUrl,
  fetchModelMeta,
  fetchModels,
  type ModelMeta,
} from "../api/models";

type DocumentsProps = {
  /** Prefill from Upload “View” or deep-link. */
  initialModelId?: string | null;
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

export default function Documents({ initialModelId = null }: DocumentsProps) {
  const [catalog, setCatalog] = useState<ModelMeta[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(initialModelId ?? "");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [meta, setMeta] = useState<ModelMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshCatalog() {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const models = await fetchModels(200);
      setCatalog(models);
    } catch (err) {
      setCatalog([]);
      setCatalogError(err instanceof Error ? err.message : "Failed to list documents");
    } finally {
      setCatalogLoading(false);
    }
  }

  useEffect(() => {
    void refreshCatalog();
  }, []);

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

  async function loadModel(rawId: string) {
    const modelId = rawId.trim();
    if (!modelId) {
      setError("Select a processed document to view.");
      return;
    }

    setLoading(true);
    setError(null);
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

  return (
    <main className="vr-docs">
      <header className="vr-docs__header">
        <h1 className="vr-docs__title">Documents</h1>
        <p className="vr-docs__lead">
          Choose any manuscript the backend has processed and inspect its mesh in the 3D viewer.
        </p>
      </header>

      <div className="vr-docs__load">
        <label className="vr-docs__field" htmlFor="vr-docs-model-select">
          <span className="vr-docs__field-label">
            <MaterialIcon name="folder_open" />
            Processed documents
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
                ? "Loading documents…"
                : catalog.length
                  ? "Select a document…"
                  : "No processed documents yet"}
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
                ? "Select a document above to load its mesh."
                : "No processed documents yet. Upload a manuscript first."}
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
