type ShareQrPanelProps = {
  url: string;
  title?: string;
  hint?: string;
  onCopy: () => void;
  copied?: boolean;
};

/**
 * Stable share link + QR image for museum/event ops (#146).
 * QR is rendered via QuickChart (no new npm dep); copy still works offline.
 */
export function ShareQrPanel({
  url,
  title = "Share link",
  hint,
  onCopy,
  copied,
}: ShareQrPanelProps) {
  const qrSrc = `https://quickchart.io/qr?${new URLSearchParams({
    text: url,
    size: "200",
    margin: "1",
  }).toString()}`;

  return (
    <section className="vr-share" aria-label={title}>
      <div className="vr-share__copy-row">
        <h2 className="vr-share__title">{title}</h2>
        <button type="button" className="vr-enter__text-btn" onClick={onCopy}>
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      {hint ? <p className="vr-share__hint">{hint}</p> : null}
      <p className="vr-share__url">
        <code>{url}</code>
      </p>
      <figure className="vr-share__qr">
        <img src={qrSrc} alt="QR code for this space link" width={200} height={200} />
        <figcaption>Scan to open</figcaption>
      </figure>
    </section>
  );
}
