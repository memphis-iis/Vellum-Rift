import { lazy, Suspense, useEffect, useState } from "react";
import { useAuth } from "./auth/AuthContext";
import { AmbientBackground } from "./components/AmbientBackground";
import type { AppSection } from "./components/AppChrome";
import { SideNav } from "./components/SideNav";
const Documents = lazy(() => import("./screens/Documents"));
const Demos = lazy(() => import("./screens/Demos"));
const Enter = lazy(() => import("./screens/Enter"));
const Home = lazy(() => import("./screens/Home"));
const KioskJoin = lazy(() => import("./screens/KioskJoin"));
const Login = lazy(() => import("./screens/Login"));
const Sessions = lazy(() => import("./screens/Sessions"));
const Upload = lazy(() => import("./screens/Upload"));

function ScreenFallback() {
  return (
    <div className="vr-screen-loading" role="status">
      Loading...
    </div>
  );
}
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
        <Suspense fallback={<ScreenFallback />}>
        {section === "home" ? (
          <Home
            onUpload={() => setSection("upload")}
            onJoinSession={() => setSection("sessions")}
            onEnterSession={enterSession}
            onBrowseDemos={() => setSection("demos")}
          />
        ) : null}
        {section === "demos" ? <Demos onEnterSession={enterSession} /> : null}
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
        </Suspense>
      </div>
    </div>
  );
}

export default function App() {
  const { user } = useAuth();
  const kioskSessionId = readKioskDeepLink();

  // Museum QR path: skip Bluekey when ?session=&kiosk=1 (#145).
  if (!user && kioskSessionId) {
    return (
      <Suspense fallback={<ScreenFallback />}>
        <KioskJoin sessionId={kioskSessionId} />
      </Suspense>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<ScreenFallback />}>
        <Login />
      </Suspense>
    );
  }
  return <Dashboard />;
}
