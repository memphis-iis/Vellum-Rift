import "../styles/screens/demos.css";
import { DemoCatalog } from "../components/DemoCatalog";
import type { DemoCatalogItem } from "../api/demos";

type DemosProps = {
  onEnterSession: (sessionId: string) => void;
};

export default function Demos({ onEnterSession }: DemosProps) {
  const onTry = (demo: DemoCatalogItem) => {
    onEnterSession(demo.sessionId);
  };

  return (
    <main className="vr-demos-page">
      <header className="vr-demos-page__header">
        <h1 className="vr-demos-page__title">Demos</h1>
        <p className="vr-demos-page__lead">
          Curated Spaces with example manuscripts - pick a category and jump straight into 3D.
        </p>
      </header>
      <DemoCatalog onTry={onTry} tryLabel="Enter demo" />
    </main>
  );
}
