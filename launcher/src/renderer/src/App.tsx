import { useState, useEffect } from 'react';
import { ServerStatus } from './components/ServerStatus';
import { SessionPanel } from './components/SessionPanel';
import { LaunchButton } from './components/LaunchButton';
import { BackendLogs } from './components/BackendLogs';
import { GameStateDisplay } from './components/GameStateDisplay';

type AppMode = 'development' | 'production';

interface Session {
  id: string;
  label: string;
  playerCount: number;
}

export default function App() {
  const [mode, setMode] = useState<AppMode>('development');
  const [backendUrl, setBackendUrl] = useState('http://localhost:4000');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [unityStatus, setUnityStatus] = useState<'running' | 'stopped'>('stopped');

  useEffect(() => {
    window.launcherAPI.getMode().then(setMode);
    
    window.launcherAPI.getMode().then((m) => {
      if (m === 'production') {
        setBackendUrl('https://api.vellumrift.com');
      }
    });

    window.launcherAPI.onUnityExited(() => {
      setUnityStatus('stopped');
    });
  }, []);

  const handleCreateSession = async (label: string) => {
    try {
      const response = await fetch(`${backendUrl}/api/game-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      
      if (response.ok) {
        const session = await response.json();
        const newSession: Session = {
          id: session.sessionId,
          label: session.label || 'Untitled Session',
          playerCount: 0,
        };
        setSessions((prev) => [...prev, newSession]);
        setSelectedSession(newSession);
      }
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const handleJoinSession = (session: Session) => {
    setSelectedSession(session);
  };

  const handleLaunchUnity = async () => {
    if (!selectedSession) return;

    const result = await window.launcherAPI.launchUnity({
      sessionId: selectedSession.id,
      backendUrl,
    });

    if (result.success) {
      setUnityStatus('running');
    } else {
      console.error('Failed to launch Unity:', result.error);
    }
  };

  const handleKillUnity = async () => {
    await window.launcherAPI.killUnity();
    setUnityStatus('stopped');
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Vellum Rift Launcher</h1>
        <span className={`mode-badge ${mode}`}>{mode}</span>
      </header>

      <ServerStatus 
        backendUrl={backendUrl} 
        onUrlChange={setBackendUrl}
        mode={mode}
      />

      <BackendLogs backendUrl={backendUrl} />

      <SessionPanel
        sessions={sessions}
        selectedSession={selectedSession}
        onCreateSession={handleCreateSession}
        onJoinSession={handleJoinSession}
      />

      <GameStateDisplay backendUrl={backendUrl} />

      <div className="launch-section">
        <LaunchButton
          selectedSession={selectedSession}
          unityStatus={unityStatus}
          onLaunch={handleLaunchUnity}
          onStop={handleKillUnity}
        />
      </div>
    </div>
  );
}