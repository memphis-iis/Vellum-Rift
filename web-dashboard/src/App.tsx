import { useState } from "react";
import { useAuth } from "./auth/AuthContext";
import { AmbientBackground } from "./components/AmbientBackground";
import { AppChrome, type AppSection } from "./components/AppChrome";
import Home from "./screens/Home";
import Login from "./screens/Login";
import "./styles/vr-theme.css";

function Placeholder({ title }: { title: string }) {
  return (
    <main className="vr-home">
      <div className="vr-home__inner">
        <h1 className="vr-home__title" style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)" }}>
          {title}
        </h1>
        <p className="vr-home__lead">This surface is next — home chrome and CTAs are wired.</p>
      </div>
    </main>
  );
}

function Dashboard() {
  const { user, logout } = useAuth();
  const [section, setSection] = useState<AppSection>("home");

  const email = user?.isLocalDev
    ? `${user.email} (local)`
    : user?.email || "signed-in@memphis.edu";

  return (
    <div className="vr-app">
      <AmbientBackground />
      <AppChrome
        active={section}
        email={email}
        onNavigate={setSection}
        onSignOut={logout}
      />
      {section === "home" ? (
        <Home
          onUpload={() => setSection("upload")}
          onJoinSession={() => setSection("sessions")}
        />
      ) : null}
      {section === "upload" ? <Placeholder title="Upload" /> : null}
      {section === "sessions" ? <Placeholder title="Sessions" /> : null}
      {section === "enter" ? <Placeholder title="Enter" /> : null}
    </div>
  );
}

export default function App() {
  const { user } = useAuth();
  if (!user) return <Login />;
  return <Dashboard />;
}
