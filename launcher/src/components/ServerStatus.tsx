import { useState, useEffect } from 'react';

interface ServerStatusProps {
  backendUrl: string;
  onUrlChange: (url: string) => void;
  mode: 'development' | 'production';
}

type HealthStatus = 'ok' | 'degraded' | 'offline' | 'checking';

export function ServerStatus({ backendUrl, onUrlChange, mode }: ServerStatusProps) {
  const [status, setStatus] = useState<HealthStatus>('checking');
  const [details, setDetails] = useState<string>('');
  const [isStarting, setIsStarting] = useState(false);

  const checkHealth = async () => {
    setStatus('checking');
    const result = await window.launcherAPI.checkBackendHealth(backendUrl);
    setStatus(result.status);
    setDetails(result.details || '');
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, [backendUrl]);

  const handleStartBackend = async () => {
    setIsStarting(true);
    const result = await window.launcherAPI.startBackend();
    setIsStarting(false);
    if (result.success) {
      // Wait a moment for backend to start, then check health
      setTimeout(checkHealth, 3000);
    } else {
      setDetails(result.error || 'Failed to start backend');
    }
  };

  const handleStopBackend = async () => {
    await window.launcherAPI.stopBackend();
    setTimeout(checkHealth, 2000);
  };

  return (
    <div className="card">
      <h2>Backend</h2>
      <div className="status-indicator">
        <span className={`status-dot ${status === 'checking' ? 'degraded' : status}`} />
        <span>
          {status === 'checking' ? 'Checking...' : status === 'ok' ? 'Connected' : status === 'degraded' ? 'Degraded' : 'Offline'}
        </span>
        {details && <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>({details})</span>}
      </div>
      
      <div className="input-group">
        <input
          type="text"
          className="input"
          value={backendUrl}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="Backend URL"
        />
      </div>

      {mode === 'development' && (
        <div className="btn-group">
          <button 
            className="btn btn-success" 
            onClick={handleStartBackend}
            disabled={isStarting || status === 'ok'}
          >
            {isStarting ? 'Starting...' : 'Start Backend'}
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={handleStopBackend}
            disabled={status === 'offline'}
          >
            Stop Backend
          </button>
        </div>
      )}
    </div>
  );
}