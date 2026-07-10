interface Session {
  id: string;
  label: string;
  playerCount: number;
}

interface LaunchButtonProps {
  selectedSession: Session | null;
  unityStatus: 'running' | 'stopped';
  onLaunch: () => void;
  onStop: () => void;
}

export function LaunchButton({ selectedSession, unityStatus, onLaunch, onStop }: LaunchButtonProps) {
  const isRunning = unityStatus === 'running';

  return (
    <div className="card">
      <h2>Unity Client</h2>
      
      <div className="unity-status">
        <span className={`status-dot ${isRunning ? 'ok' : 'offline'}`} />
        <span>{isRunning ? 'Running' : 'Stopped'}</span>
      </div>

      {selectedSession && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Session: {selectedSession.label} ({selectedSession.id.slice(0, 8)}...)
        </div>
      )}

      <div className="btn-group" style={{ marginTop: '1rem' }}>
        <button
          className="btn btn-primary launch-btn"
          onClick={onLaunch}
          disabled={!selectedSession || isRunning}
        >
          {!selectedSession ? 'Select a Session First' : isRunning ? 'Unity is Running' : 'Launch Unity'}
        </button>
        
        {isRunning && (
          <button
            className="btn btn-secondary"
            onClick={onStop}
          >
            Stop
          </button>
        )}
      </div>
    </div>
  );
}