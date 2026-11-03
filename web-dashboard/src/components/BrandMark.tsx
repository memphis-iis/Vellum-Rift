/** Respect Vite `--base` (e.g. `/static/vellum-dashboard/`) so logos resolve on IIS. */
function publicAsset(filename: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${filename.replace(/^\//, "")}`;
}

/** Local transparent assets (black plate removed from Bluekey catalog PNG). */
export const VELLUM_LOGO_URL = publicAsset("vellumrift-logo.png");
/** Emblem only (no baked wordmark) for header / compact lockups */
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
 * Vellum Rift mark: transparent PNGs for dark VR chrome.
 * Ship cleaned assets from `public/` (not the remote Bluekey icon URL).
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
      />
    </div>
  );
}
