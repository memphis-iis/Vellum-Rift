import { useState } from 'react';

interface Session {
  id: string;
  label: string;
  playerCount: number;
}

interface SessionPanelProps {
  sessions: Session[];
  selectedSession: Session | null;
  onCreateSession: (label: string) => void;
  onJoinSession: (session: Session) => void;
}

export function SessionPanel({ sessions, selectedSession, onCreateSession, onJoinSession }: SessionPanelProps) {
  const [newSessionLabel, setNewSessionLabel] = useState('');
  const [joinSessionId, setJoinSessionId] = useState('');

  const handleCreate = () => {
    if (newSessionLabel.trim()) {
      onCreateSession(newSessionLabel.trim());
      setNewSessionLabel('');
    }
  };

  const handleJoinById = () => {
    if (joinSessionId.trim()) {
      const session = sessions.find(s => s.id === joinSessionId.trim());
      if (session) {
        onJoinSession(session);
      } else {
        // Create a placeholder session for joining by ID
        onJoinSession({
          id: joinSessionId.trim(),
          label: `Session ${joinSessionId.trim().slice(0, 8)}`,
          playerCount: 0,
        });
      }
      setJoinSessionId('');
    }
  };

  return (
    <div className="card">
      <h2>Sessions</h2>
      
      {sessions.length > 0 && (
        <div className="session-list">
          {sessions.map((session) => (
            <div 
              key={session.id} 
              className="session-item"
              style={{ 
                border: selectedSession?.id === session.id ? '1px solid var(--accent)' : 'none',
                cursor: 'pointer'
              }}
              onClick={() => onJoinSession(session)}
            >
              <div className="session-info">
                <span className="session-name">{session.label}</span>
                <span className="session-meta">
                  ID: {session.id.slice(0, 8)}... | Players: {session.playerCount}
                </span>
              </div>
              <button 
                className="btn btn-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onJoinSession(session);
                }}
              >
                {selectedSession?.id === session.id ? 'Selected' : 'Join'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="input-group">
        <input
          type="text"
          className="input"
          value={newSessionLabel}
          onChange={(e) => setNewSessionLabel(e.target.value)}
          placeholder="New session name..."
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <button className="btn btn-primary" onClick={handleCreate}>
          Create
        </button>
      </div>

      <div className="input-group">
        <input
          type="text"
          className="input"
          value={joinSessionId}
          onChange={(e) => setJoinSessionId(e.target.value)}
          placeholder="Or enter session ID to join..."
          onKeyDown={(e) => e.key === 'Enter' && handleJoinById()}
        />
        <button className="btn btn-secondary" onClick={handleJoinById}>
          Join by ID
        </button>
      </div>
    </div>
  );
}