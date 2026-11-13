import { useEffect, useState } from "react";
import { fetchDemoAdminStatus } from "../../api/demos";
import { setSessionDemo, type GameSession } from "../../api/gameState";
import { readDemoDrafts, readFlag } from "./helpers";
import type { HostRunner } from "./useHostRunner";

type DemoContext = {
  host: HostRunner;
  session: GameSession | null;
  applySession: (session: GameSession) => void;
};

function useIsDemoAdmin(): boolean {
  const [isDemoAdmin, setIsDemoAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchDemoAdminStatus()
      .then((ok) => {
        if (!cancelled) setIsDemoAdmin(ok);
      })
      .catch(() => {
        if (!cancelled) setIsDemoAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return isDemoAdmin;
}

export function useDemoAdmin({ host, session, applySession }: DemoContext) {
  const isDemoAdmin = useIsDemoAdmin();
  const [category, setCategory] = useState("Examples");
  const [summary, setSummary] = useState("");
  const enabled = readFlag(session, "demoEnabled");

  useEffect(() => {
    const drafts = readDemoDrafts(session);
    setCategory(drafts.category);
    setSummary(drafts.summary);
    // Re-seed only when the persisted demo fields change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.demoCategory, session?.demoSummary, session?.metadata, session?.sessionId]);

  const save = (publish: boolean) => {
    if (!isDemoAdmin) return;
    void host.act("Demo catalog update failed", async (id) => {
      const updated = await setSessionDemo(id, {
        enabled: publish,
        category: category.trim() || "Examples",
        summary: summary.trim(),
      });
      applySession(updated);
      return publish
        ? "Published to Try now / Demos (kiosk enabled for guests)"
        : "Removed from Try now / Demos";
    });
  };

  return { isDemoAdmin, enabled, category, setCategory, summary, setSummary, save };
}

export type DemoAdminState = ReturnType<typeof useDemoAdmin>;
