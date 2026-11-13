import { useEffect, useState } from "react";
import { fetchDemos } from "../api/demos";

/** True when GET /api/demos has at least one available exhibit. */
export function useDemoAvailability(): {
  hasDemos: boolean;
  loading: boolean;
} {
  const [hasDemos, setHasDemos] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchDemos()
      .then((res) => {
        if (!cancelled) setHasDemos(res.demos.length > 0);
      })
      .catch(() => {
        if (!cancelled) setHasDemos(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { hasDemos, loading };
}
