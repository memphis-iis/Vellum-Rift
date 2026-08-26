import { VELLUM_LOGO_URL } from "../auth/config";

type BrandMarkProps = {
  /** Show wordmark next to the logo */
  withWordmark?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
};

const SIZE_PX = { sm: 36, md: 48, lg: 72 } as const;

/**
 * Vellum Rift mark (Bluekey catalog icon on IIS static).
 */
export function BrandMark({ withWordmark = true, className = "", size = "md" }: BrandMarkProps) {
  const px = SIZE_PX[size];
  return (
    <div className={`vr-brand ${className}`.trim()}>
      <img
        className="vr-brand__logo"
        src={VELLUM_LOGO_URL}
        alt=""
        width={px}
        height={px}
        decoding="async"
      />
      {withWordmark ? <span className="vr-brand__wordmark">VELLUM RIFT</span> : null}
      <span className="vr-brand__sr-only">Vellum Rift</span>
    </div>
  );
}
