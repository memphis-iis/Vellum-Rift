import { useEffect, useState } from "react";
import { useAuth } from "./auth/AuthContext";
import { AmbientBackground } from "./components/AmbientBackground";
import type { AppSection } from "./components/AppChrome";
import { SideNav } from "./components/SideNav";
import Documents from "./screens/Documents";
import Enter from "./screens/Enter";
import Home from "./screens/Home";
import KioskJoin from "./screens/KioskJoin";
import Login from "./screens/Login";
import Sessions from "./screens/Sessions";
import Upload from "./screens/Upload";
import "./styles/vr-theme.css";

function readSessionDeepLink(): string | null {
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("session");
    if (fromQuery?.trim()) return fromQuery.trim();
  } catch {
    /* ignore */
  }
  return null;
}

function readKioskDeepLink(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const kiosk = params.get("kiosk");
    if (kiosk !== "1" && kiosk?.toLowerCase() !== "true") return null;
    const sessionId = params.get("session")?.trim();
    return sessionId || null;
  } catch {
    return null;
  }
}

function Dashboard() {
  const { user, logout } = useAuth();
  const [section, setSection] = useState<AppSection>("home");
  const [documentModelId, setDocumentModelId] = useState<string | null>(null);
  const [libraryAddSessionId, setLibraryAddSessionId] = useState<string | null>(null);
  const [enterSessionId, setEnterSessionId] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = readSessionDeepLink();
    if (!sessionId) return;
    setEnterSessionId(sessionId);
    setSection("enter");
  }, []);

  const email = user?.isLocalDev
    ? `${user.email} (local)`
    : user?.email || "signed-in@memphis.edu";

  const openDocument = (modelId: string) => {
    setDocumentModelId(modelId);
    setLibraryAddSessionId(null);
    setSection("documents");
  };

  const openLibraryForSpace = (sessionId: string) => {
    setLibraryAddSessionId(sessionId);
    setDocumentModelId(null);
    setSection("documents");
  };

  const enterSession = (sessionId: string) => {
    setEnterSessionId(sessionId);
    setSection("enter");
  };

  const leaveSessionRoom = () => {
    setEnterSessionId(null);
    setSection("sessions");
  };

  return (
    <div className={`vr-app vr-app--shell${section === "home" ? " vr-app--home" : ""}`}>
      {section === "home" ? <AmbientBackground /> : null}
      <SideNav
        active={section}
        email={email}
        onNavigate={(next) => {
          if (next !== "documents") {
            setDocumentModelId(null);
            setLibraryAddSessionId(null);
          }
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
            onEnterSession={enterSession}
          />
        ) : null}
        {section === "upload" ? <Upload onViewModel={openDocument} /> : null}
        {section === "documents" ? (
          <Documents
            initialModelId={documentModelId}
            initialAddSessionId={libraryAddSessionId}
            onOpenInSpace={enterSession}
          />
        ) : null}
        {section === "sessions" ? (
          <Sessions
            onEnterSession={enterSession}
            onNewSessionUpload={() => setSection("upload")}
            onAddFromLibrary={openLibraryForSpace}
          />
        ) : null}
        {section === "enter" ? (
          <Enter
            sessionId={enterSessionId}
            onLeave={leaveSessionRoom}
            onBrowseSessions={() => setSection("sessions")}
            onAddFromLibrary={openLibraryForSpace}
          />
        ) : null}
      </div>
    </div>
  );
}

export default function App() {
  const { user } = useAuth();
  const kioskSessionId = readKioskDeepLink();

  // Museum QR path: skip Bluekey when ?session=&kiosk=1 (#145).
  if (!user && kioskSessionId) {
    return <KioskJoin sessionId={kioskSessionId} />;
  }

  if (!user) return <Login />;
  return <Dashboard />;
}
