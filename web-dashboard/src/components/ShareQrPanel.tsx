import { useEffect, useId, useRef } from "react";
import { MaterialIcon } from "./MaterialIcon";

type ShareQrPanelProps = {
  open: boolean;
  onClose: () => void;
  url: string;
  title?: string;
  hint?: string;
  onCopy: () => void;
  copied?: boolean;
};

/**
 * Share link + QR in a modal for museum/event ops (#146).
 * QR via QuickChart (no new npm dep); copy still works offline.
 */
export function ShareQrPanel({
  open,
  onClose,
  url,
  title = "Share link",
  hint,
  onCopy,
  copied,
}: ShareQrPanelProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const qrSrc = `https://quickchart.io/qr?${new URLSearchParams({
    text: url,
    size: "240",
    margin: "1",
  }).toString()}`;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="vr-share-modal" role="presentation">
      <button
        type="button"
        className="vr-share-modal__backdrop"
        aria-label="Close share dialog"
        onClick={onClose}
      />
      <div
        className="vr-share-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="vr-share-modal__head">
          <h2 id={titleId} className="vr-share__title">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="vr-share-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            <MaterialIcon name="close" />
          </button>
        </div>
        {hint ? <p className="vr-share__hint">{hint}</p> : null}
        <p className="vr-share__url">
          <code>{url}</code>
        </p>
        <figure className="vr-share__qr">
          <img src={qrSrc} alt="QR code for this space link" width={240} height={240} />
          <figcaption>Scan to open</figcaption>
        </figure>
        <div className="vr-share-modal__actions">
          <button type="button" className="vr-btn vr-btn--primary" onClick={onCopy}>
            <MaterialIcon name="content_copy" />
            {copied ? "Copied" : "Copy link"}
          </button>
          <button type="button" className="vr-btn vr-btn--ghost" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
