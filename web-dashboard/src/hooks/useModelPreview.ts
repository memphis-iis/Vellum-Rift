import { useEffect, useState } from "react";
import { fetchModelGlbObjectUrl, fetchModelMeta, type ModelMeta } from "../api/models";

export type ModelPreviewState = {
  src: string | null;
  meta: ModelMeta | null;
  loading: boolean;
  error: string | null;
};

function revokeBlob(url: string | null | undefined) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

/**
 * Load authenticated GLB + meta for in-dashboard mesh preview (#238 / #239).
 * Caller should treat empty modelId as the empty state (no fetch).
 */
export function useModelPreview(modelId: string | null | undefined): ModelPreviewState {
  const [src, setSrc] = useState<string | null>(null);
  const [meta, setMeta] = useState<ModelMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = typeof modelId === "string" ? modelId.trim() : "";
    if (!id) {
      setMeta(null);
      setError(null);
      setLoading(false);
      setSrc((prev) => {
        revokeBlob(prev);
        return null;
      });
      return;
    }

    let cancelled = false;
    let fetchedUrl: string | null = null;
    setLoading(true);
    setError(null);
    setMeta(null);

    void (async () => {
      try {
        const [nextMeta, nextSrc] = await Promise.all([
          fetchModelMeta(id),
          fetchModelGlbObjectUrl(id),
        ]);
        if (cancelled) {
          revokeBlob(nextSrc);
          return;
        }
        fetchedUrl = nextSrc;
        setSrc((prev) => {
          revokeBlob(prev);
          return nextSrc;
        });
        setMeta(nextMeta);
      } catch (err) {
        revokeBlob(fetchedUrl);
        if (cancelled) return;
        setSrc((prev) => {
          revokeBlob(prev);
          return null;
        });
        setMeta(null);
        setError(err instanceof Error ? err.message : "Failed to load model");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [modelId]);

  useEffect(() => {
    return () => {
      revokeBlob(src);
    };
  }, [src]);

  return { src, meta, loading, error };
}
