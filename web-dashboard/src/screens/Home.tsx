import { BrandMark } from "../components/BrandMark";
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
      </div>
    </main>
  );
}
