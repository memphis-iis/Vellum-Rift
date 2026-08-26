import { useEffect, useRef } from "react";
import "@google/model-viewer";

type ModelViewerProps = {
  src: string;
  alt?: string;
  className?: string;
};

/**
 * Thin React wrapper around Google's <model-viewer> web component.
 * Expects a blob: or https: URL to a .glb / .gltf asset.
 */
export function ModelViewer({ src, alt = "Manuscript mesh", className = "" }: ModelViewerProps) {
  const ref = useRef<HTMLElement | null>(null);

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
