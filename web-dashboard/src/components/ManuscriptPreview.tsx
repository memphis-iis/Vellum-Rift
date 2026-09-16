import { MaterialIcon } from "./MaterialIcon";
import { ModelViewer } from "./ModelViewer";
import type { ModelPreviewState } from "../hooks/useModelPreview";

type ManuscriptPreviewProps = {
  preview: ModelPreviewState;
  /** Shown when nothing is selected / no model id. */
  emptyMessage?: string;
  /** Alt text for the mesh when meta label is missing. */
  alt?: string;
  className?: string;
};

/**
 * Shared GLB preview chrome for Library browse (#238) and Space loadout (#239).
 */
export function ManuscriptPreview({
  preview,
  emptyMessage = "Select a manuscript to preview its mesh.",
  alt,
  className = "",
}: ManuscriptPreviewProps) {
  const { src, meta, loading, error } = preview;
  const label = meta?.label?.trim() || alt || "Manuscript mesh";

  return (
    <section
      className={`vr-manuscript-preview ${className}`.trim()}
      aria-live="polite"
      aria-label="Manuscript preview"
    >
      {loading ? (
        <div className="vr-manuscript-preview__empty">
          <MaterialIcon name="progress_activity" className="vr-manuscript-preview__spinner" />
          <p>Fetching mesh from the rift…</p>
        </div>
      ) : null}

      {!loading && error ? (
        <div className="vr-manuscript-preview__empty vr-manuscript-preview__empty--error" role="alert">
          <MaterialIcon name="error" className="vr-manuscript-preview__empty-icon" />
          <p>{error}</p>
        </div>
      ) : null}

      {!loading && !error && !src ? (
        <div className="vr-manuscript-preview__empty">
          <MaterialIcon name="view_in_ar" className="vr-manuscript-preview__empty-icon" />
          <p>{emptyMessage}</p>
        </div>
      ) : null}

      {!loading && !error && src ? (
        <div className="vr-manuscript-preview__viewer">
          <ModelViewer src={src} alt={label} />
        </div>
      ) : null}
    </section>
  );
}
