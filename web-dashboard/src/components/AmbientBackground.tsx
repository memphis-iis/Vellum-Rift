/**
 * Ambient layer behind post-login chrome.
 *
 * Today: topographic grain (on `.vr-app`) + fog.
 * Later: set `VITE_HOME_BG_VIDEO_URL` to a muted looping WebM/MP4
 * (e.g. `/home-bg.webm` in `public/` or a CDN URL) for a low-latency VR plate.
 * Video sits under fog so UI contrast holds.
 */

type AmbientBackgroundProps = {
  videoSrc?: string;
};

export function AmbientBackground({ videoSrc }: AmbientBackgroundProps) {
  const src = (videoSrc ?? import.meta.env.VITE_HOME_BG_VIDEO_URL ?? "").trim();

  return (
    <div className="vr-ambient" aria-hidden>
      {src ? (
        <video
          className="vr-ambient__video"
          src={src}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          disablePictureInPicture
        />
      ) : null}
      <div className="vr-ambient__fog" />
    </div>
  );
}
