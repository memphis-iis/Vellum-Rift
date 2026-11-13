import "../styles/screens/demos.css";
import { useEffect, useMemo, useState } from "react";
import {
  demoPreviewUrl,
  fetchDemos,
  groupDemosByCategory,
  type DemoCatalogItem,
} from "../api/demos";
import { MaterialIcon } from "./MaterialIcon";
import { ModelViewer } from "./ModelViewer";

export type DemoCatalogProps = {
  onTry: (demo: DemoCatalogItem) => void;
  tryLabel?: string;
  compact?: boolean;
  className?: string;
  /** When true, render nothing if the catalog is empty (Login hide). */
  hideWhenEmpty?: boolean;
  onCount?: (count: number) => void;
};

export function DemoCatalog({
  onTry,
  tryLabel = "Try now",
  compact = false,
  className = "",
  hideWhenEmpty = false,
  onCount,
}: DemoCatalogProps) {
  const [demos, setDemos] = useState<DemoCatalogItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchDemos()
      .then((res) => {
        if (cancelled) return;
        setDemos(res.demos);
        setCategories(res.categories);
        setError(null);
        onCount?.(res.demos.length);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDemos([]);
        setCategories([]);
        onCount?.(0);
        setError(err instanceof Error ? err.message : "Could not load demos");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onCount]);

  const grouped = useMemo(() => {
    const filtered =
      filter === "all" ? demos : demos.filter((d) => d.category === filter);
    return groupDemosByCategory(filtered);
  }, [demos, filter]);

  if (loading) {
    return (
      <div className={`vr-demos${compact ? " vr-demos--compact" : ""} ${className}`.trim()}>
        <div className="vr-demos__skeleton" aria-busy="true" aria-label="Loading demos">
          <div className="vr-demos__skeleton-card" />
          <div className="vr-demos__skeleton-card" />
          <div className="vr-demos__skeleton-card" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`vr-demos${compact ? " vr-demos--compact" : ""} ${className}`.trim()}>
        <p className="vr-demos__status vr-demos__status--error">{error}</p>
      </div>
    );
  }

  if (!demos.length) {
    if (hideWhenEmpty) return null;
    return (
      <div className={`vr-demos${compact ? " vr-demos--compact" : ""} ${className}`.trim()}>
        <p className="vr-demos__status">No demos available right now.</p>
      </div>
    );
  }

  return (
    <div className={`vr-demos${compact ? " vr-demos--compact" : ""} ${className}`.trim()}>
      {categories.length > 1 ? (
        <div className="vr-demos__filters" role="tablist" aria-label="Demo categories">
          <button
            type="button"
            role="tab"
            aria-selected={filter === "all"}
            className={`vr-demos__filter${filter === "all" ? " vr-demos__filter--active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={filter === cat}
              className={`vr-demos__filter${filter === cat ? " vr-demos__filter--active" : ""}`}
              onClick={() => setFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      ) : null}

      <div className="vr-demos__grid">
        {grouped.flatMap((group) =>
          group.demos.map((demo) => {
            const previewSrc = demoPreviewUrl(demo);
            return (
              <article key={demo.sessionId} className="vr-demos__card">
                {previewSrc ? (
                  <div className="vr-demos__preview" aria-hidden={compact ? true : undefined}>
                    <ModelViewer src={previewSrc} alt={demo.label} className="vr-demos__viewer" />
                  </div>
                ) : (
                  <div className="vr-demos__preview vr-demos__preview--empty">
                    <MaterialIcon name="view_in_ar" />
                  </div>
                )}
                <div className="vr-demos__card-copy">
                  {demo.category ? (
                    <p className="vr-demos__card-category">{demo.category}</p>
                  ) : null}
                  <h3 className="vr-demos__card-title">{demo.label}</h3>
                  {demo.summary ? (
                    <p className="vr-demos__card-summary">{demo.summary}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="vr-btn vr-btn--primary vr-demos__try"
                  onClick={() => onTry(demo)}
                >
                  <MaterialIcon name="play_arrow" filled />
                  {tryLabel}
                </button>
              </article>
            );
          }),
        )}
      </div>
    </div>
  );
}
