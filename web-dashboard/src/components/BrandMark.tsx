/** Public assets under Vite `base` (IIS: `/static/vellum-dashboard/`). */
function publicAsset(file: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const joined = `${base.endsWith("/") ? base : `${base}/`}${file.replace(/^\//, "")}`;
  return joined.replace(/([^:]\/)\/+/g, "$1");
}

/** Local transparent assets (Black plate removed from Bluekey catalog PNG). */
export const VELLUM_LOGO_URL = publicAsset("vellumrift-logo.png");
/** Emblem only (no baked wordmark) — header / compact lockups */
export const VELLUM_MARK_URL = publicAsset("vellumrift-mark.png");

type BrandMarkProps = {
  /** Full stacked logo vs emblem-only */
  variant?: "full" | "mark";
  className?: string;
  size?: "sm" | "md" | "lg";
};

/** Height caps; width follows intrinsic aspect ratio */
const HEIGHT_PX = { sm: 40, md: 56, lg: 112 } as const;

/**
 * Vellum Rift mark — transparent PNGs for dark VR chrome.
 * (Source catalog art lives on IIS Bluekey static; we ship cleaned assets in `public/`.)
 */
export function BrandMark({ variant = "mark", className = "", size = "md" }: BrandMarkProps) {
  const h = HEIGHT_PX[size];
  const src = variant === "full" ? VELLUM_LOGO_URL : VELLUM_MARK_URL;
  return (
    <div className={`vr-brand vr-brand--${variant} ${className}`.trim()}>
      <img
        className="vr-brand__logo"
        src={src}
        alt="Vellum Rift"
        height={h}
        decoding="async"
        onError={(e) => {
          const img = e.currentTarget;
          img.style.display = "none";
          const parent = img.parentElement;
          if (parent && !parent.querySelector(".vr-brand__fallback")) {
            const fallback = document.createElement("span");
            fallback.className = "vr-brand__fallback";
            fallback.textContent = "Vellum Rift";
            parent.appendChild(fallback);
          }
        }}
      />
    </div>
  );
}
