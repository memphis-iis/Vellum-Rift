import { useState } from "react";
import { useAuth } from "./auth/AuthContext";
import { AmbientBackground } from "./components/AmbientBackground";
import type { AppSection } from "./components/AppChrome";
import { SideNav } from "./components/SideNav";
import Documents from "./screens/Documents";
import Home from "./screens/Home";
import Login from "./screens/Login";
import Sessions from "./screens/Sessions";
import Upload from "./screens/Upload";
import "./styles/vr-theme.css";

function Placeholder({
  title,
  lead,
  sessionId,
}: {
  title: string;
  lead?: string;
  sessionId?: string | null;
}) {
  return (
    <main className="vr-upload">
      <header className="vr-upload__header">
        <h1 className="vr-upload__title">{title}</h1>
        <p className="vr-upload__lead">
          {lead || "This surface is next — chrome and other sections are wired."}
        </p>
        {sessionId ? (
          <p className="vr-upload__lead" style={{ marginTop: "1rem", opacity: 0.85 }}>
            Selected session: <code>{sessionId}</code>
          </p>
        ) : null}
      </header>
    </main>
  );
}

function Dashboard() {
  const { user, logout } = useAuth();
  const [section, setSection] = useState<AppSection>("home");
  const [documentModelId, setDocumentModelId] = useState<string | null>(null);
  const [enterSessionId, setEnterSessionId] = useState<string | null>(null);

  const email = user?.isLocalDev
    ? `${user.email} (local)`
    : user?.email || "signed-in@memphis.edu";

  const openDocument = (modelId: string) => {
    setDocumentModelId(modelId);
    setSection("documents");
  };

  const enterSession = (sessionId: string) => {
    setEnterSessionId(sessionId);
    setSection("enter");
  };

  return (
    <div className={`vr-app vr-app--shell${section === "home" ? " vr-app--home" : ""}`}>
      {section === "home" ? <AmbientBackground /> : null}
      <SideNav
        active={section}
        email={email}
        onNavigate={(next) => {
          if (next !== "documents") setDocumentModelId(null);
          if (next !== "enter") setEnterSessionId(null);
          setSection(next);
        }}
        onSignOut={logout}
        onNewSession={() => setSection("sessions")}
      />
      <div className="vr-shell-main">
        {section === "home" ? (
          <Home
            onUpload={() => setSection("upload")}
            onJoinSession={() => setSection("sessions")}
          />
        ) : null}
        {section === "upload" ? <Upload onViewModel={openDocument} /> : null}
        {section === "documents" ? <Documents initialModelId={documentModelId} /> : null}
        {section === "sessions" ? (
          <Sessions
            onEnterSession={enterSession}
            onNewSessionUpload={() => setSection("upload")}
          />
        ) : null}
        {section === "enter" ? (
          <Placeholder
            title="Enter"
            lead="Session join / Unity launch surface is next. Session ID is ready from Sessions."
            sessionId={enterSessionId}
          />
        ) : null}
      </div>
    </div>
  );
}

export default function App() {
  const { user } = useAuth();
  if (!user) return <Login />;
  return <Dashboard />;
}
