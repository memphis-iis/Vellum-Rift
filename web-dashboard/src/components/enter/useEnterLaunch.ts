import { useState } from "react";
import {
  launchWebGlWithAuthHandoff,
  readDashboardAccessToken,
  readDashboardEmail,
  webGlOriginFromBaseUrl,
} from "../../auth/launchWebGl";
import { useStatus } from "../StatusRegion";
import { initialEnterMode, type CopyKind, type EnterMode } from "./helpers";
import type { LaunchLinks } from "./useLaunchLinks";

export function useCopy() {
  const toast = useStatus();
  const [copied, setCopied] = useState<CopyKind | null>(null);

  const copy = async (kind: CopyKind, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
      toast.announce("Copied to clipboard.");
    } catch {
      toast.alert("Could not copy. Select the text and copy it manually.");
    }
  };
  return { copied, copy };
}

function openWebGlUrl(url: string | null, fallbackEmail: string) {
  if (!url) return;
  const origin = webGlOriginFromBaseUrl(import.meta.env.VITE_WEBGL_BASE_URL ?? "");
  if (!origin) {
    window.open(url, "vellumRiftWebGL");
    return;
  }
  launchWebGlWithAuthHandoff({
    url,
    accessToken: readDashboardAccessToken(),
    email: readDashboardEmail() || fallbackEmail,
    webGlOrigin: origin,
  });
}

/** Play/Observer mode, embedded 3D toggle and desktop handoff panel state. */
export function useEnterLaunch(links: LaunchLinks, userEmail: string) {
  const [mode, setMode] = useState<EnterMode>(initialEnterMode);
  const [in3d, setIn3d] = useState(false);
  const [showDesktop, setShowDesktop] = useState(false);
  const { observerUrl, webGlUrl, webGlEmbedUrl } = links;
  const effectiveMode: EnterMode = !observerUrl && mode === "observer" ? "play" : mode;

  const launch = () => {
    if (effectiveMode === "observer") {
      if (observerUrl) openWebGlUrl(observerUrl, userEmail);
      else setShowDesktop(true);
      return;
    }
    if (webGlEmbedUrl) setIn3d(true);
    else setShowDesktop(true);
  };

  const openNewTab = () =>
    openWebGlUrl(effectiveMode === "observer" ? observerUrl : webGlUrl, userEmail);

  return {
    mode: effectiveMode,
    setMode,
    in3d,
    setIn3d,
    showDesktop,
    toggleDesktop: () => setShowDesktop((v) => !v),
    launch,
    openNewTab,
  };
}

export type EnterLaunch = ReturnType<typeof useEnterLaunch>;
