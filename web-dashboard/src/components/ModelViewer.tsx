import { useEffect, useRef } from "react";

type ModelViewerProps = {
  src: string;
  alt?: string;
  className?: string;
};

/**
 * Thin React wrapper around Google's <model-viewer> web component.
 * Expects a blob: or https: URL to a .glb / .gltf asset.
 */
export function ModelViewer({ src, alt = "Asset mesh", className = "" }: ModelViewerProps) {
  const ref = useRef<HTMLElement | null>(null);

  // Registers the <model-viewer> custom element on first use (keeps ~1 MB out of the entry chunk).
  useEffect(() => {
    void import("@google/model-viewer");
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.setAttribute("src", src);
  }, [src]);

  return (
    <model-viewer
      ref={ref as never}
      className={className || "vr-model-viewer"}
      alt={alt}
      camera-controls
      touch-action="pan-y"
      shadow-intensity="0.6"
      exposure="1"
      interaction-prompt="auto"
      style={{ width: "100%", height: "100%", backgroundColor: "#000" }}
    />
  );
}
