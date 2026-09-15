import { useEffect, useState } from "react";
import { BrandMark } from "../components/BrandMark";
import { MaterialIcon } from "../components/MaterialIcon";
import { fetchSessions, type GameSession } from "../api/sessions";
import {
  formatEventWindow,
  pickFeaturedEvent,
  sessionEndsAt,
  sessionKind,
  sessionStartsAt,
} from "../api/sessionEvent";

type HomeProps = {
  onUpload: () => void;
  onJoinSession: () => void;
  onEnterSession?: (sessionId: string) => void;
};

export default function Home({ onUpload, onJoinSession, onEnterSession }: HomeProps) {
  const [featured, setFeatured] = useState<GameSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchSessions()
      .then((list) => {
        if (!cancelled) setFeatured(pickFeaturedEvent(list));
      })
      .catch(() => {
        if (!cancelled) setFeatured(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const windowLabel = featured
    ? formatEventWindow(sessionStartsAt(featured), sessionEndsAt(featured))
    : null;

  return (
    <main className="vr-home">
      <div className="vr-home__inner">
        <div className="vr-home__copy">
          <div className="vr-home__logo">
            <BrandMark variant="full" size="lg" />
          </div>
          <h1 className="vr-home__title">
            Virtual Learning Spaces <br className="vr-home__br" />
            for web and VR
          </h1>
          <p className="vr-home__lead">
            Collaborative learning rooms on the web and in VR — bring manuscripts into a shared
            spatial space your group can explore together.
          </p>
        </div>

        <div className="vr-home__actions">
          <button type="button" className="vr-btn vr-btn--primary" onClick={onUpload}>
            <MaterialIcon name="upload_file" filled />
            Upload a manuscript
          </button>
          <button type="button" className="vr-btn vr-btn--ghost" onClick={onJoinSession}>
            <MaterialIcon name="login" />
            Join a space
          </button>
        </div>

        {featured && sessionKind(featured) === "event" ? (
          <section className="vr-home__featured" aria-label="Featured event">
            <p className="vr-home__featured-eyebrow">Featured event</p>
            <h2 className="vr-home__featured-title">
              {featured.label?.trim() || "Untitled event"}
            </h2>
            {windowLabel ? (
              <p className="vr-home__featured-window">{windowLabel}</p>
            ) : (
              <p className="vr-home__featured-window">Open learning space</p>
            )}
            <button
              type="button"
              className="vr-btn vr-btn--outline"
              onClick={() => onEnterSession?.(featured.sessionId) ?? onJoinSession()}
            >
              <MaterialIcon name="event" />
              Enter event space
            </button>
          </section>
        ) : null}
      </div>
    </main>
  );
}
