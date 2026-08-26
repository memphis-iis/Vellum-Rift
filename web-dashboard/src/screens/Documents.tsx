import { type FormEvent, useEffect, useState } from "react";
import { MaterialIcon } from "../components/MaterialIcon";
import { ModelViewer } from "../components/ModelViewer";
import { fetchModelGlbObjectUrl, fetchModelMeta, type ModelMeta } from "../api/models";

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

export default function Documents({ initialModelId = null }: DocumentsProps) {
  const [inputId, setInputId] = useState(initialModelId ?? "");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [meta, setMeta] = useState<ModelMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialModelId) {
      setInputId(initialModelId);
      void loadModel(initialModelId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once when prop arrives
  }, [initialModelId]);

  useEffect(() => {
    return () => {
      if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
    };
  }, [src]);

  async function loadModel(rawId: string) {
    const modelId = rawId.trim();
    if (!modelId) {
      setError("Enter a model ID from a completed upload job.");
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

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void loadModel(inputId);
  };

  return (
    <main className="vr-docs">
      <header className="vr-docs__header">
        <h1 className="vr-docs__title">Documents</h1>
        <p className="vr-docs__lead">
          Load a processed manuscript mesh by model ID and inspect it in the 3D viewer.
        </p>
      </header>

      <form className="vr-docs__load" onSubmit={onSubmit}>
        <label className="vr-docs__field" htmlFor="vr-docs-model-id">
          <span className="vr-docs__field-label">
            <MaterialIcon name="deployed_code" />
            Model ID
          </span>
          <input
            id="vr-docs-model-id"
            className="vr-docs__input"
            type="text"
            spellCheck={false}
            autoComplete="off"
            placeholder="UUID from completed job"
            value={inputId}
            disabled={loading}
            onChange={(e) => setInputId(e.target.value)}
          />
        </label>
        <button type="submit" className="vr-btn vr-btn--primary" disabled={loading || !inputId.trim()}>
          {loading ? "Loading…" : "Load model"}
        </button>
      </form>

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
            <p>No model loaded yet. Paste a model ID or open one from Upload when a job is Ready.</p>
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
