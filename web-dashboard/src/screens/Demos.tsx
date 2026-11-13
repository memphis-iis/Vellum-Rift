import "../styles/screens/demos.css";
import { demoKioskHref, type DemoCatalogItem } from "../api/demos";
import { DemoCatalog } from "../components/DemoCatalog";

export default function Demos() {
  const onTry = (demo: DemoCatalogItem) => {
    window.location.assign(demoKioskHref(demo.sessionId));
  };

  return (
    <main className="vr-demos-page">
      <header className="vr-demos-page__header">
        <h1 className="vr-demos-page__title">Demos</h1>
        <p className="vr-demos-page__lead">
          Browse example assets in 3D, then enter the space — no setup.
        </p>
      </header>
      <DemoCatalog onTry={onTry} tryLabel="Enter demo" />
    </main>
  );
}
