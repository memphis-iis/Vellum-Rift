import { lazy, Suspense, useEffect, useState } from "react";
import { useAuth } from "./auth/AuthContext";
import { AmbientBackground } from "./components/AmbientBackground";
import type { AppSection } from "./components/AppChrome";
import { SideNav } from "./components/SideNav";
import { useDemoAvailability } from "./hooks/useDemoAvailability";
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

function dashboardLabel(user: ReturnType<typeof useAuth>["user"]): string {
  if (user?.isGuest) return "Guest";
  if (user?.isLocalDev) return `${user.email} (local)`;
  return user?.email || "signed-in@memphis.edu";
}

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

const GUEST_SECTIONS = new Set<AppSection>(["home", "demos"]);

function Dashboard() {
  const { user, logout } = useAuth();
  const guestMode = Boolean(user?.isGuest);
  const { hasDemos } = useDemoAvailability();
  const [section, setSection] = useState<AppSection>("home");
  const [documentModelId, setDocumentModelId] = useState<string | null>(null);
  const [libraryAddSessionId, setLibraryAddSessionId] = useState<string | null>(null);
  const [enterSessionId, setEnterSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (guestMode) return;
    const sessionId = readSessionDeepLink();
    if (!sessionId) return;
    setEnterSessionId(sessionId);
    setSection("enter");
  }, [guestMode]);

  useEffect(() => {
    if (!hasDemos && section === "demos") setSection("home");
  }, [hasDemos, section]);

  useEffect(() => {
    if (guestMode && !GUEST_SECTIONS.has(section)) setSection("home");
  }, [guestMode, section]);

  const email = dashboardLabel(user);

  const openDocument = (modelId: string) => {
    if (guestMode) return;
    setDocumentModelId(modelId);
    setLibraryAddSessionId(null);
    setSection("documents");
  };

  const openLibraryForSpace = (sessionId: string) => {
    if (guestMode) return;
    setLibraryAddSessionId(sessionId);
    setDocumentModelId(null);
    setSection("documents");
  };

  const enterSession = (sessionId: string) => {
    if (guestMode) return;
    setEnterSessionId(sessionId);
    setSection("enter");
  };

  const leaveSessionRoom = () => {
    setEnterSessionId(null);
    setSection("sessions");
  };

  const navigate = (next: AppSection) => {
    if (guestMode && !GUEST_SECTIONS.has(next)) return;
    if (next !== "documents") {
      setDocumentModelId(null);
      setLibraryAddSessionId(null);
    }
    if (next !== "enter") setEnterSessionId(null);
    setSection(next);
  };

  return (
    <div className={`vr-app vr-app--shell${section === "home" ? " vr-app--home" : ""}`}>
      {section === "home" ? <AmbientBackground /> : null}
      <SideNav
        active={section}
        email={email}
        showDemos={hasDemos}
        guestMode={guestMode}
        onNavigate={navigate}
        onSignOut={logout}
        onNewSession={guestMode ? undefined : () => setSection("sessions")}
      />
      <div className="vr-shell-main">
        <Suspense fallback={<ScreenFallback />}>
        {section === "home" ? (
          <Home
            onUpload={() => setSection("upload")}
            onJoinSession={() => setSection("sessions")}
            onEnterSession={enterSession}
            onBrowseDemos={() => setSection("demos")}
            showTryNow={hasDemos}
            guestMode={guestMode}
          />
        ) : null}
        {section === "demos" && hasDemos ? <Demos onEnterSession={enterSession} /> : null}
        {!guestMode && section === "upload" ? <Upload onViewModel={openDocument} /> : null}
        {!guestMode && section === "documents" ? (
          <Documents
            initialModelId={documentModelId}
            initialAddSessionId={libraryAddSessionId}
            onOpenInSpace={enterSession}
          />
        ) : null}
        {!guestMode && section === "sessions" ? (
          <Sessions
            onEnterSession={enterSession}
            onNewSessionUpload={() => setSection("upload")}
            onAddFromLibrary={openLibraryForSpace}
          />
        ) : null}
        {!guestMode && section === "enter" ? (
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

  // Museum QR / Try now Enter demo: ?session=&kiosk=1 always opens kiosk join
  // (even when a demo-guest shell session is already stored).
  if (kioskSessionId) {
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
