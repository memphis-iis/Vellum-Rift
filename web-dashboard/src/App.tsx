type ServiceCardProps = {
  name: string;
  endpoint: string;
  description: string;
};

function ServiceCard({ name, endpoint, description }: ServiceCardProps) {
  return (
    <article className="service-card">
      <div className="service-card__eyebrow">Service</div>
      <h3>{name}</h3>
      <p>{description}</p>
      <code>{endpoint}</code>
    </article>
  );
}

const services: ServiceCardProps[] = [
  {
    name: "Backend API",
    endpoint: "http://localhost:4000/api/health",
    description: "Document ingestion, persistence, and application routes."
  },
  {
    name: "WebRTC SFU",
    endpoint: "http://localhost:4100/health",
    description: "Realtime voice and data-channel coordination layer."
  },
  {
    name: "Hasura",
    endpoint: "http://localhost:8080",
    description: "GraphQL and subscription layer over the local Postgres stack."
  }
];

export default function App() {
  return (
    <main className="app-shell">
      <section className="hero">
        <p className="hero__eyebrow">Vellum Rift Dashboard</p>
        <h1>Web control surface for manuscript sessions, ingestion, and collaboration.</h1>
        <p className="hero__body">
          This Vite and React scaffold is the starting point for the hosted dashboard. It is wired into the
          monorepo and ready to grow into uploads, session browsing, team management, and document playback.
        </p>
        <div className="hero__actions">
          <a href="http://localhost:8080" target="_blank" rel="noreferrer">
            Open Hasura
          </a>
          <a href="http://localhost:9001" target="_blank" rel="noreferrer">
            Open MinIO Console
          </a>
        </div>
      </section>

      <section className="grid-block">
        <header className="section-header">
          <p>Local stack</p>
          <h2>Development services the dashboard expects to talk to</h2>
        </header>
        <div className="service-grid">
          {services.map((service) => (
            <ServiceCard key={service.name} {...service} />
          ))}
        </div>
      </section>

      <section className="grid-block grid-block--split">
        <div className="panel">
          <p className="panel__eyebrow">Planned slices</p>
          <h2>First dashboard concerns</h2>
          <ul>
            <li>Upload TIFF, JPEG, and PDF source documents.</li>
            <li>Track preprocessing progress and invite readiness.</li>
            <li>Enter or observe shared manuscript sessions.</li>
            <li>Review exported non-PII research artifacts.</li>
          </ul>
        </div>
        <div className="panel panel--accent">
          <p className="panel__eyebrow">Monorepo fit</p>
          <h2>How this package is wired today</h2>
          <ul>
            <li>`pnpm dev` starts the dashboard alongside backend and SFU.</li>
            <li>`pnpm build` includes the dashboard in the recursive workspace build.</li>
            <li>The package is isolated enough to add routing, auth, or design-system work next.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
