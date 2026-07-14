import { useState, useEffect } from 'react';

interface GameStateDisplayProps {
  backendUrl: string;
}

interface GameState {
  sessionId: string;
  label: string;
  hostId: string;
  players: Array<{
    id: string;
    displayName: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    isHost: boolean;
    isConnected: boolean;
    joinedAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export function GameStateDisplay({ backendUrl }: GameStateDisplayProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const fetchGameState = async () => {
    try {
      const result = await window.launcherAPI.getGameState(backendUrl);
      if (result.success && result.data) {
        setGameState(result.data);
        setError(null);
      } else {
        setError(result.error || 'Failed to fetch game state');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  useEffect(() => {
    fetchGameState();
    const interval = setInterval(fetchGameState, 5000);
    return () => clearInterval(interval);
  }, [backendUrl]);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0 }}>Game State</h2>
        <button 
          className="btn btn-secondary" 
          onClick={() => setIsExpanded(!isExpanded)} 
          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
        >
          {isExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {error && (
        <div style={{ color: 'var(--error)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
          {error}
        </div>
      )}

      {!gameState && !error && (
        <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem' }}>
          No active game session.
        </div>
      )}

      {gameState && (
        <div style={{ 
          maxHeight: isExpanded ? '400px' : '150px',
          overflowY: 'auto',
          background: 'var(--bg-primary)',
          borderRadius: '0.25rem',
          padding: '0.75rem',
          fontSize: '0.875rem'
        }}>
          <div style={{ marginBottom: '0.5rem' }}>
            <strong>Session:</strong> {gameState.label || 'Untitled'}
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <strong>ID:</strong> <code style={{ fontSize: '0.75rem' }}>{gameState.sessionId}</code>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <strong>Status:</strong> {gameState.isActive ? '🟢 Active' : '🔴 Inactive'}
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <strong>Players:</strong> {gameState.players.length}
          </div>
          
          {gameState.players.length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              <strong>Player List:</strong>
              <div style={{ marginTop: '0.5rem' }}>
                {gameState.players.map((player) => (
                  <div 
                    key={player.id} 
                    style={{ 
                      padding: '0.5rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: '0.25rem',
                      marginBottom: '0.25rem',
                      fontSize: '0.75rem'
                    }}
                  >
                    <div>
                      {player.isHost && '👑 '}
                      {player.displayName}
                      {player.isConnected ? ' 🟢' : ' 🔴'}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                      Pos: ({player.position.x.toFixed(1)}, {player.position.y.toFixed(1)}, {player.position.z.toFixed(1)})
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <div>Created: {new Date(gameState.createdAt).toLocaleString()}</div>
            <div>Updated: {new Date(gameState.updatedAt).toLocaleString()}</div>
          </div>
        </div>
      )}
    </div>
  );
}