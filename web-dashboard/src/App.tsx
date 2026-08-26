import { useState } from "react";
import { useAuth } from "./auth/AuthContext";
import { AmbientBackground } from "./components/AmbientBackground";
import type { AppSection } from "./components/AppChrome";
import { SideNav } from "./components/SideNav";
import Home from "./screens/Home";
import Login from "./screens/Login";
import Upload from "./screens/Upload";
import "./styles/vr-theme.css";

function Placeholder({ title }: { title: string }) {
  return (
    <main className="vr-upload">
      <header className="vr-upload__header">
        <h1 className="vr-upload__title">{title}</h1>
        <p className="vr-upload__lead">This surface is next — chrome and upload are wired.</p>
      </header>
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
    <div className={`vr-app vr-app--shell${section === "home" ? " vr-app--home" : ""}`}>
      {section === "home" ? <AmbientBackground /> : null}
      <SideNav
        active={section}
        email={email}
        onNavigate={setSection}
        onSignOut={logout}
        onNewSession={() => setSection("upload")}
      />
      <div className="vr-shell-main">
        {section === "home" ? (
          <Home
            onUpload={() => setSection("upload")}
            onJoinSession={() => setSection("sessions")}
          />
        ) : null}
        {section === "upload" ? <Upload /> : null}
        {section === "sessions" ? <Placeholder title="Sessions" /> : null}
        {section === "enter" ? <Placeholder title="Enter" /> : null}
      </div>
    </div>
  );
}

export default function App() {
  const { user } = useAuth();
  if (!user) return <Login />;
  return <Dashboard />;
}
