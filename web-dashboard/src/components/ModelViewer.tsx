import { useEffect, useRef, useState } from "react";
import "@google/model-viewer";

type ModelViewerProps = {
  src: string;
  alt?: string;
  className?: string;
};

/**
 * Thin React wrapper around Google's <model-viewer> web component.
 * Expects a blob: or https: URL to a .glb / .gltf asset.
 *
 * Neutral environment + raised exposure so manuscript meshes read on dark
 * kiosk chrome instead of a featureless black panel (#256).
 */
export function ModelViewer({ src, alt = "Manuscript mesh", className = "" }: ModelViewerProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setStatus("loading");
    el.setAttribute("src", src);

    const onLoad = () => setStatus("ready");
    const onError = () => setStatus("error");
    el.addEventListener("load", onLoad);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("load", onLoad);
      el.removeEventListener("error", onError);
    };
  }, [src]);

  return (
    <div className="vr-model-viewer-wrap" data-status={status}>
      {status === "loading" ? (
        <p className="vr-model-viewer__status" role="status">
          Loading preview…
        </p>
      ) : null}
      {status === "error" ? (
        <p className="vr-model-viewer__status vr-model-viewer__status--error" role="alert">
          Could not render this manuscript preview.
        </p>
      ) : null}
      <model-viewer
        ref={ref as never}
        className={className || "vr-model-viewer"}
        alt={alt}
        camera-controls
        touch-action="pan-y"
        auto-rotate
        environment-image="neutral"
        shadow-intensity="0.35"
        exposure="1.35"
        interaction-prompt="auto"
        camera-orbit="25deg 70deg 105%"
        field-of-view="32deg"
        loading="eager"
        reveal="auto"
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: "#2a2a32",
          opacity: status === "ready" ? 1 : 0.35,
        }}
      />
    </div>
  );
}
