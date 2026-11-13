import "../styles/screens/demos.css";
import { useEffect, useMemo, useState } from "react";
import {
  fetchDemos,
  groupDemosByCategory,
  type DemoCatalogItem,
} from "../api/demos";
import { MaterialIcon } from "./MaterialIcon";

export type DemoCatalogProps = {
  /** Guest path: open kiosk join. Signed-in: enter Lobby. */
  onTry: (demo: DemoCatalogItem) => void;
  tryLabel?: string;
  compact?: boolean;
  className?: string;
};

export function DemoCatalog({
  onTry,
  tryLabel = "Try now",
  compact = false,
  className = "",
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
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDemos([]);
        setCategories([]);
        setError(err instanceof Error ? err.message : "Could not load demos");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const filtered =
      filter === "all" ? demos : demos.filter((d) => d.category === filter);
    return groupDemosByCategory(filtered);
  }, [demos, filter]);

  if (loading) {
    return (
      <div className={`vr-demos${compact ? " vr-demos--compact" : ""} ${className}`.trim()}>
        <p className="vr-demos__status">Loading examples…</p>
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
    return (
      <div className={`vr-demos${compact ? " vr-demos--compact" : ""} ${className}`.trim()}>
        <p className="vr-demos__status">
          No published examples yet. Check back soon, or sign in to explore your own Spaces.
        </p>
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

      <div className="vr-demos__groups">
        {grouped.map((group) => (
          <section
            key={group.category}
            className="vr-demos__group"
            aria-label={group.category}
          >
            <h3 className="vr-demos__group-title">{group.category}</h3>
            <ul className="vr-demos__list">
              {group.demos.map((demo) => (
                <li key={demo.sessionId} className="vr-demos__item">
                  <div className="vr-demos__item-copy">
                    <p className="vr-demos__item-title">{demo.label}</p>
                    {demo.summary ? (
                      <p className="vr-demos__item-summary">{demo.summary}</p>
                    ) : (
                      <p className="vr-demos__item-summary">
                        {demo.playlistCount} manuscript
                        {demo.playlistCount === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="vr-btn vr-btn--primary vr-demos__try"
                    onClick={() => onTry(demo)}
                  >
                    <MaterialIcon name="play_arrow" filled />
                    {tryLabel}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
