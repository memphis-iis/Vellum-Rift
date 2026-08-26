import { useAuth } from "./auth/AuthContext";
import Login from "./screens/Login";

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
    description: "Document ingestion, persistence, and application routes.",
  },
  {
    name: "WebRTC SFU",
    endpoint: "http://localhost:4100/health",
    description: "Realtime voice and data-channel coordination layer.",
  },
  {
    name: "PostgreSQL",
    endpoint: "localhost:5432",
    description: "Durable session state via the Express REST API.",
  },
];

function DashboardHome() {
  const { user, logout } = useAuth();

  return (
    <main className="app-shell">
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        <p style={{ margin: 0, fontWeight: 700 }}>
          Signed in as {user?.email}
          {user?.isLocalDev ? " (local developer)" : ""}
        </p>
        <button type="button" onClick={logout} style={{ cursor: "pointer" }}>
          Sign out
        </button>
      </header>

      <section className="hero">
        <p className="hero__eyebrow">Vellum Rift Dashboard</p>
        <h1>Web control surface for manuscript sessions, ingestion, and collaboration.</h1>
        <p className="hero__body">
          Bluekey sign-in is in place. Next slices: upload, session browse/entry, and the VR-themed app
          shell.
        </p>
        <div className="hero__actions">
          <a href="http://localhost:4000/api/health" target="_blank" rel="noreferrer">
            Backend Health
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
          <p className="panel__eyebrow">Auth</p>
          <h2>How sign-in works</h2>
          <ul>
            <li>Production: Bluekey popup → Bearer token for API calls.</li>
            <li>Local: Continue as local developer when `VITE_AUTH_REQUIRED` is unset.</li>
            <li>Post-login VR theme is a separate follow-up.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const { user } = useAuth();
  if (!user) return <Login />;
  return <DashboardHome />;
}
