import { MaterialIcon } from "../components/MaterialIcon";

type HomeProps = {
  onUpload: () => void;
  onJoinSession: () => void;
};

export default function Home({ onUpload, onJoinSession }: HomeProps) {
  return (
    <main className="vr-home">
      <div className="vr-home__inner">
        <div className="vr-home__copy">
          <div className="vr-home__glow" aria-hidden />
          <h1 className="vr-home__title">
            Manuscript sessions <br className="vr-home__br" />
            for web and VR
          </h1>
          <p className="vr-home__lead">
            Immerse yourself in a limitless spatial environment designed for high-stakes information
            management and collaborative analysis.
          </p>
        </div>

        <div className="vr-home__actions">
          <button type="button" className="vr-btn vr-btn--primary" onClick={onUpload}>
            <MaterialIcon name="upload_file" filled />
            Upload a manuscript
          </button>
          <button type="button" className="vr-btn vr-btn--ghost" onClick={onJoinSession}>
            <MaterialIcon name="login" />
            Join a session
          </button>
        </div>
      </div>
    </main>
  );
}
